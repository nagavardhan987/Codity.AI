import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import http from 'http';
import { Server } from 'socket.io';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.routes';
import orgRoutes from './routes/org.routes';
import projectRoutes from './routes/project.routes';
import queueRoutes from './routes/queue.routes';
import jobRoutes from './routes/job.routes';
import dashboardRoutes from './routes/dashboard.routes';
import { errorHandler } from './middlewares/errorHandler';
import './scheduler/scheduler'; // Import to start the background scheduler

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

// Set up HTTP server and Socket.IO
const server = http.createServer(app);
export const io = new Server(server, {
  cors: {
    origin: '*', // Allow frontend to connect
  }
});

io.on('connection', (socket) => {
  console.log('Dashboard connected via WebSocket');
});

const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  message: { status: 'error', message: 'Too many requests, please try again later.' }
});

app.use(cors());
app.use(express.json());
app.use(limiter); // Apply rate limiting to all requests

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/orgs', orgRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Error Handling Middleware
app.use(errorHandler);

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
