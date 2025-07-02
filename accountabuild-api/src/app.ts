import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import cors from 'cors';
import { corsOptions } from './config/cors';
import errorHandler from './middleware/errorHandler';
import { apiLimiter } from './config/rateLimiter';

import indexRouter from './routes/index';
import usersRouter from './routes/users';
import authRouter from './routes/auth';
import groupsRouter from './routes/groups';
import messagesRouter from './routes/messages';
import goalsRouter from './routes/goals';
import workoutsRouter from './routes/workouts';

const app = express();

// Apply the general API rate limiter to all requests
app.use(apiLimiter);

// Use CORS middleware
app.use(cors(corsOptions));

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/', indexRouter);
app.use('/users', usersRouter);
app.use('/auth', authRouter);
app.use('/groups', groupsRouter);
app.use('/messages', messagesRouter);
app.use('/goals', goalsRouter);
app.use('/workouts', workoutsRouter);

// Use the custom error handler
app.use(errorHandler);

export default app; 