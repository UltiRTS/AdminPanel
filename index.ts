import express, { Request, Response, Express, Router } from 'express';
import * as dotenv from 'dotenv';
import {DataManager} from './lib/db';
import * as config from './config';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import jszip from 'jszip';
import path from 'path';
import axios, { Axios, AxiosPromise } from 'axios';
import MultipartDownload from 'multipart-download';

import { hashElement } from 'folder-hash';
import { off } from 'process';
const options4engine = {
    folders: { exclude: ['node_modules'], include: ['AI', 'include', 'lib', 'share', 'LuaUI']},
    files: {include: ['*']}
}
const options4mod = {
    folders: { exclude: ['node_modules'], include: ['features', 'gamedata', 'LuaRules', 'LuaGaia', 'LuaUI', 'lups', 'units', 'weapons', 'scripts', 'modularCommAPI']},
    files: {include: ['*']}
}

const downloads: {
    [key: string]: {
        handler: Promise<void> | null,
        downloaded_size: number,
        status: string
    }
} = {}




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
const systemConfigRoutes = Router();
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
systemConfigRoutes.use(auth);


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

        const zip_hash = crypto.createHash('md5').update(zip_file.buffer).digest('hex');

        fs.writeFileSync(`${config.archiveDir}/${zip_name}`, zip_file.buffer);
        fs.chmodSync(`${config.archiveDir}/${zip_name}`, 0o777);
        
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

archiveRoutes.get('/file-io/:key', async (req: Request, res: Response) => {
    const { key } = req.params;
    if(key in downloads) {
        res.send({
            status: true,
            download: {
                size: downloads[key].downloaded_size,
                status: downloads[key].status
            }
        })
    } else {
        res.send({
            status: false, 
            downloads: {
                size: 0,
                status: 'not exists'
            }
        })
    }
})

archiveRoutes.post('/file-io', async (req: Request, res: Response) => {
    const key = req.body.key;
    const filename = req.body.filename;
    const extract_to = req.body.extract_to;

    if(!key || !filename || !extract_to) {
        return res.status(400).send({
            status: false,
            msg: 'No key, filename, extract_to provided'
        });
    }

    downloads[key] = {
        handler: null,
        downloaded_size: 0,
        status: 'downloading'
    }

    const md5 = crypto.createHash('md5');

    downloads[key].handler = axios({
        url: `http://file.io/${key}`,
        method: 'GET',
        responseType: 'stream',
    }).then(async (resp) => {
        resp.data
            .on('data', (chunk: Buffer) => {
                downloads[key].downloaded_size += chunk.length;
                md5.update(chunk)
            })
            .on('end', async () => {
                downloads[key].status = 'done';
                const zip_hash = md5.digest('hex');
                const insertRes = await dbm.insertArchive({
                    zip_name: filename,
                    extract_to,
                    zip_hash
                })

                downloads[key].status = insertRes.status? 'inserted': 'failed to insert';
            })
            .pipe(fs.createWriteStream(`${config.archiveDir}/${filename}`));
    }).catch(e => {
        console.log(e);
        downloads[key].status = 'failed';
    })

    res.send({
        status: true,
        msg: 'download started'
    })
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

systemConfigRoutes.get('/', async (req: Request, res: Response) => {
    const dbRes = await dbm.getSystemConfig();
    res.send(dbRes);
})

systemConfigRoutes.post('/', async (req: Request, res: Response) => {
    try {
        const { config_name, engine, mod, type } = req.body;
        const engineQuery = await dbm.getArchive(engine);
        const modQuery = await dbm.getArchive(mod);
        if(!engineQuery.status || engineQuery.archive === null) {
            res.send({
                status: false,
                msg: 'Get engine failed'
            })
            return;
        }
        if(!modQuery.status || modQuery.archive === null) {
            res.send({
                status: false,
                msg: 'Get engine failed'
            })
            return;
        }

        const engineInfo = engineQuery.archive;
        const modInfo = modQuery.archive;

        const engineContent = fs.readFileSync(`${config.archiveDir}/${engineInfo.zip_name}`);
        const modContent = fs.readFileSync(`${config.archiveDir}/${modInfo.zip_name}`);
        if(!engineContent || !modContent) {
            res.send({
                status: false,
                msg: 'archive file may be deleted'
            })
            return;
        }

        const engineZip = await jszip.loadAsync(engineContent);
        const modZip = await jszip.loadAsync(modContent);

        const engineDir = path.join(config.contextDir, engineInfo.extract_to);
        const modDir = path.join(config.contextDir, modInfo.extract_to);

        if(!fs.existsSync(engineDir)) {
            fs.mkdirSync(engineDir);
        }

        for(const key of Object.keys(engineZip.files)) {
            const item = engineZip.files[key];
            if(item.dir) {
                fs.mkdirSync(path.join(engineDir, item.name));
            } else {
                fs.writeFileSync(path.join(engineDir, item.name), Buffer.from(await item.async('arraybuffer')));
            }
        }

        if(!fs.existsSync(modDir)) {
            fs.mkdirSync(modDir);
        }

        for(const key of Object.keys(modZip.files)) {
            const item = modZip.files[key];
            if(item.dir) {
                fs.mkdirSync(path.join(modDir, item.name));
            } else {
                fs.writeFileSync(path.join(modDir, item.name), Buffer.from(await item.async('arraybuffer')));
            }
        }

        try {
            const engine_essentials_hash = (await hashElement(engineDir, options4engine)).hash;
            const mod_essentials_hash = (await hashElement(modDir, options4mod)).hash;
            const dbRes = await dbm.addSystemConfig(config_name, engine, mod, engine_essentials_hash, mod_essentials_hash, type);
            if(dbRes.status) {
                res.send({
                    status: true,
                    msg: 'Add system config success',
                });
            } else {
                res.send({
                    status: false,
                    msg: 'Add system config failed',
                });
            }
        } catch(e) {
            console.log(e);
            res.send({
                status: false,
                msg: 'insertion failed'
            });
        }

    } catch(e) {
        console.log(e);
        res.send({
            status: false,
            msg: 'Insert failed'
        });
    }
})

app.use('/archives', archiveRoutes);
app.use('/systemconf', systemConfigRoutes);




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
                    token: ''
                })
            }
        } else {
            res.send({
                status: false,
                msg: 'Login failed',
                token: ''
            })
        }
    } catch(e) {
        console.log(e);
        res.send({
            status: false,
            msg: 'Login failed',
            token: ''
        });
    }
})

app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
})


app.listen(port, () => {
  console.log(`[server]: Server is running at https://localhost:${port}`);
});