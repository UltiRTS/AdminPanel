import express, { Request, Response, Express, Router } from 'express';
import * as dotenv from 'dotenv';
import {DataManager} from './lib/db';
import * as config from './config';

const dbm = new DataManager('mysql', {
    host : '127.0.0.1',
    port : 3306,
    user : config.dbuser,
    password : config.dbpass,
    database : config.dbname
});

dotenv.config();

const app: Express = express();
const archiveRoutes = Router();
const port: string = process.env.PORT || '3000';

app.get('/', async (req: Request, res: Response) => {
    const dbRes = await dbm.getArarchives();
    res.send(dbRes);
});

app.put('/', async (req: Request, res: Response) => {
    const { zip_name, extract_to, zip_hash } = req.body;
    const dbRes = await dbm.insertArchive({
        zip_name,
        extract_to,
        zip_hash
    })

    res.send(dbRes);
})

app.delete('/', async (req: Request, res: Response) => {
    const { id } = req.body;
    const dbRes = await dbm.deleteArchive(id);
    res.send(dbRes);
})

app.listen(port, () => {
  console.log(`[server]: Server is running at https://localhost:${port}`);
});