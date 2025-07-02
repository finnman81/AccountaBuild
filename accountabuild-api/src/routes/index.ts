import express, { Request, Response } from 'express';
const router = express.Router();

/* GET home page. */
router.get('/', function (req: Request, res: Response) {
  res.json({ message: 'Welcome to Accountabuild API', title: 'Express' });
});

export default router;
