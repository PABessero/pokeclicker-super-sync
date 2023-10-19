import { JsonDB, Config } from "node-json-db";

export class Db {
  constructor() {
    this.jsonDB = new JsonDB(new Config("pokeclicker", true, true, "/"));
  }

  async getRoom(room) {
    return await this.jsonDB.getData(`/${room}`);
  }

  async addRoom(room) {
    const test = [];
    test.push(
      await this.jsonDB.push(`/${room}`, {
        pokemon: [],
        items: [],
        oakItems: [],
        badges: [],
      }),
    );
  }
}
