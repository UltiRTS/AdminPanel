import knex, {Knex} from "knex";
import crypto from 'crypto'

export class DataManager {
    knex: Knex;
    constructor(dbtype: string, connection: {
        host: string
        port: number
        user: string
        password: string
        database: string
    }) {
        this.knex = knex({
            client: dbtype,
            connection: connection
        })
    }

    async getArchiveName(id: number) {
        try {
            const archive = await this.knex.select('zip_name').from('archives').where({id: id});
            return archive[0].zip_name;
        } catch(e) {
            console.log(e);
            return null;
        }
    }

    async getArchive(id: number) {
        try {
            const archive = await this.knex.select('*').from('archives').where({id: id});
            return {
                status: true,
                msg: 'Get archive successfully',
                archive: archive.length > 0 ? archive[0] : null
            }
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Get failed',
            }
        }
    }
    
    async getArarchives() {
        try {
            const archives = await this.knex.select('*').from('archives');
            return {
                status: true,
                msg: 'Get archives successfully',
                data: archives
            }
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Get failed'
            }
        }
    }

    async insertArchive(archive: {
        zip_name: string
        extract_to: string
        zip_hash: string
    }) {
        try {
            await this.knex.transaction(async (trx) => {
                await trx.insert(archive).into('archives');
                await trx.commit();
            })    
            return {
                status: true, 
                msg: 'Inserted successfully'
            };
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Insert failed'
            }
        }
    }

    async updateArchive(id: number, archive: {
        zip_name: string
        extract_to: string
        zip_hash: string
    }) {
        try {
            await this.knex.transaction(async (trx) => {
                    await trx.update(archive).into('archives').where({id: id});
                    await trx.commit();
            })
            return {
                status: true,
                msg: 'Updated successfully'
            }
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Update failed'
            }
        }
    }

    async deleteArchive(id: number) {
        try {
            await this.knex.transaction(async (trx) => {
                await trx.delete().from('archives').where({id: id});
                await trx.commit();
            })
            return {
                status: true,
                msg: 'Deleted successfully'
            }
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Delete failed'
            }
        }
    }

    async getUser(username: string) {
        try {
            const user = await this.knex.select('*').from('user').where({username: username});
            return {
                status: true,
                msg: 'Get user successfully',
                data: user
            }
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Get failed'
            }
        }
    }

    async addSystemConfig(name: string, engine: number, mod: number, engine_essentials_hash: string, mod_essentials_hash: string, _type: string) {
        try {
            await this.knex.transaction(async (trx) => {
                await trx.insert({name, engine, mod, engine_essentials_hash, mod_essentials_hash, _type}).into('system_config');
                await trx.commit();
            })
            return {
                status: true,
                msg: 'Added successfully'
            }
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Add failed'
            }
        }
    }

    async getSystemConfig() {
        try {
            const config = await this.knex.select('*').from('system_config');
            return {
                status: true,
                msg: 'Get system config successfully',
                data: config
            }
        } catch(e) {
            console.log(e);
            return {
                status: false,
                msg: 'Get failed'
            }
        }
    }

    static saltNhash(password: string) {
        const salt = crypto.randomBytes(16).toString('hex'); 
    
        // Hashing user's salt and password with 1000 iterations, 
        
        const hash = crypto.pbkdf2Sync(password, salt,  
        1000, 64, `sha512`).toString(`hex`); 

        return {
            salt, hash
        }
    }

    verify(user: {
        salt: string
        hash: string
    }, password: string) {
        var hash = crypto.pbkdf2Sync(password,  
            user.salt, 1000, 64, `sha512`).toString(`hex`); 
            return user.hash === hash; 
    }

    generateToken(user: {
        username: string
    }) {
        const token = user.username + crypto.randomBytes(32).toString('hex');
        return token
    }
}