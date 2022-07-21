import express, { Request, Response, Express, Router } from 'express';
import * as dotenv from 'dotenv';
import {DataManager} from './lib/db';
import * as config from './config';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';

const upload = multer({ storage: multer.memoryStorage() });
const dbm = new DataManager('mysql', {
    host : '127.0.0.1',
    port : 3306,
    user : config.dbuser,
    password : config.dbpass,
    database : config.dbname
});

dotenv.config();

const app: Express = express();
app.use(express.json())
app.use(express.urlencoded({ extended: true }));

const archiveRoutes = Router();
const port: string = process.env.PORT || '3000';

// user -> username
const userPool: {[key: string]: string} = {};


const auth = (req: Request, res: Response, next: Function) => {
    const token = String(req.headers['x-access-token']);

    if (!token) {
        return res.status(401).send({ auth: false, message: 'No token provided.' });
    }
    if (!Object.values(userPool).includes(token)) {
        return res.status(401).send({ auth: false, message: 'Failed to authenticate token.' });
    }
    next();
}

archiveRoutes.use(auth);


archiveRoutes.get('/', async (req: Request, res: Response) => {
    const dbRes = await dbm.getArarchives();
    res.send(dbRes);
});

// only this use `form-data`
archiveRoutes.post('/', upload.single('zip_file'), async (req: Request, res: Response) => {
    try {
        const { zip_name, extract_to } = req.body;
        const zip_file = req.file;

        if (!zip_file) {
            return res.status(400).send({
                status: false,
                msg: 'No zip file provided'
            });
        }

        const zip_hash = crypto.createHash('sha256').update(zip_file.buffer).digest('hex');

        fs.writeFileSync(`${config.archiveDir}/${zip_name}`, zip_file.buffer);
        
        console.log(zip_hash);

        const dbRes = await dbm.insertArchive({
            zip_name,
            extract_to,
            zip_hash
        })

        res.send(dbRes);
    } catch(e) {
        console.log(e);
        res.send({
            status: false,
            msg: 'Insert failed'
        });
    }
})

archiveRoutes.delete('/', async (req: Request, res: Response) => {
    try {
        const { id } = req.body;
        console.log(id);
        const dbRes = await dbm.deleteArchive(id);
        res.send(dbRes);
    } catch(e) {
        console.log(e);
        res.send({
            status: false,
            msg: 'Delete failed'
        });
    }
})

app.use('/archives', archiveRoutes);

app.post('/auth/login', async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;
        const dbRes = await dbm.getUser(username);
        if(dbRes.status && dbRes.data) {
            const user = dbRes.data[0];
            if(dbm.verify(user, password) && user.accessLevel === 100) {
                if(user.username in userPool) {
                    res.send({
                        status: false,
                        msg: 'User already logged in',
                        token: userPool[user.username]
                    })
                } else {
                    const token = dbm.generateToken(user)
                    userPool[user.username] = token;

                    setTimeout(() => {
                        delete userPool[user.username];
                    }, 1000 * 60 * 60 * 24 * 7)
                    res.send({
                        status: true,
                        msg: 'Login successfully',
                        token: token
                    })
                }
            } else {
                res.send({
                    status: false,
                    msg: 'unprivileged user',
                })
            }
        } else {
            res.send({
                status: false,
                msg: 'Login failed'
            })
        }
    } catch(e) {
        console.log(e);
        res.send({
            status: false,
            msg: 'Login failed'
        });
    }
})

app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
})


app.listen(port, () => {
  console.log(`[server]: Server is running at https://localhost:${port}`);
});