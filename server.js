const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const User = require('./models/User');
const GroupMessage = require('./models/GroupMessage');
const PrivateMessage = require('./models/PrivateMessage');


const app = express();
app.use(express.json());
app.use(cors());

// Serve static HTML files from /views
app.use(express.static(path.join(__dirname, 'views')));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/chatapp')
    .then(() => console.log('MongoDB Connected'))
    .catch(err => console.error('MongoDB connection error:', err));

// Test route
app.get('/', (req, res) => {
    res.send('Chat Server Running');
});

/**
 * SIGNUP
 * POST /api/signup
 * body: { username, firstname, lastname, password }
 */
app.post('/api/signup', async (req, res) => {
    try {
        const { username, firstname, lastname, password } = req.body;

        if (!username || !firstname || !lastname || !password) {
            return res.status(400).json({ message: 'All fields are required' });
        }

        const existing = await User.findOne({ username: username.trim() });
        if (existing) {
            return res.status(409).json({ message: 'Username already exists' });
        }

        const timestamp = new Date().toLocaleString();

        const newUser = await User.create({
            username: username.trim(),
            firstname: firstname.trim(),
            lastname: lastname.trim(),
            password,
            createon: timestamp
        });

        return res.status(201).json({
            message: 'Signup successful',
            user: {
                username: newUser.username,
                firstname: newUser.firstname,
                lastname: newUser.lastname
            }
        });
    } catch (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});

/**
 * LOGIN
 * POST /api/login
 * body: { username, password }
 */
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ message: 'Username and password are required' });
        }

        const user = await User.findOne({ username: username.trim() });
        if (!user || user.password !== password) {
            return res.status(401).json({ message: 'Invalid username or password' });
        }

        return res.json({
            message: 'Login successful',
            user: {
                username: user.username,
                firstname: user.firstname,
                lastname: user.lastname
            }
        });
    } catch (err) {
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
});

// Socket.io
io.on('connection', (socket) => {
    console.log('User Connected');

    socket.on('register_user', (username) => {
        socket.join(username);
        console.log(`User registered for private chat: ${username}`);
    });


    socket.on('join_room', (room) => {
        socket.join(room);
        console.log(`User joined room: ${room}`);
    });

    socket.on('leave_room', (room) => {
        socket.leave(room);
        console.log(`User left room: ${room}`);
    });

    // Room-based message + MongoDB storage
    socket.on('room_message', async (data) => {
        try {
            await GroupMessage.create({
                from_user: data.from_user,
                room: data.room,
                message: data.message,
                date_sent: new Date().toLocaleString()
            });

            io.to(data.room).emit('room_message', data);
        } catch (err) {
            console.log('GroupMessage save error:', err.message);
        }
    });

    socket.on('private_message', async (data) => {
        try {
            await PrivateMessage.create({
                from_user: data.from_user,
                to_user: data.to_user,
                message: data.message,
                date_sent: new Date().toLocaleString()
            });


            io.to(data.to_user).emit('private_message', data);
            socket.emit('private_message', data);
        } catch (err) {
            console.log('PrivateMessage save error:', err.message);
        }
    });

    socket.on('typing_private', (data) => {
        io.to(data.to_user).emit('typing_private', data);
    });

    socket.on('stop_typing_private', (data) => {
        io.to(data.to_user).emit('stop_typing_private', data);
    });



    socket.on('disconnect', () => {
        console.log('User Disconnected');
    });
});

server.listen(3000, () => {
    console.log('Server running on port 3000');
});
