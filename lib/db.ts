import knex, {Knex} from "knex";

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
}