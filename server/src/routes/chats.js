import express from 'express';
import {
  listChats,
  createChat,
  getChat,
  updateChat,
  deleteChat,
  listMessages,
  sendMessage,
} from '../controllers/chatController.js';
import { authenticateUser } from '../middleware/auth.js';
import { requireDatabase } from '../middleware/databaseCheck.js';

const router = express.Router();

// Enforce database connectivity and authentication on all chat routes
router.use('/chats', requireDatabase, authenticateUser);

// Chats CRUD Endpoints
router.get('/chats', listChats);
router.post('/chats', createChat);
router.get('/chats/:chatId', getChat);
router.put('/chats/:chatId', updateChat);
router.delete('/chats/:chatId', deleteChat);

// Chat Messages Endpoints
router.get('/chats/:chatId/messages', listMessages);
router.post('/chats/:chatId/messages', sendMessage);

export default router;
