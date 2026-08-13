const initSqlJs = require('sql.js');
const fs = require('fs');

class Database {
  constructor(path, callback) {
    this.ready = false;
    this.queue = [];
    this.path = path;

    initSqlJs().then(SQL => {
      let buffer = null;
      if (path !== ':memory:' && fs.existsSync(path)) {
        buffer = fs.readFileSync(path);
      }
      this.db = new SQL.Database(buffer);
      this.ready = true;
      if (callback) {
        process.nextTick(() => callback(null));
      }
      this.processQueue();
    }).catch(err => {
      if (callback) {
        process.nextTick(() => callback(err));
      }
    });
  }

  processQueue() {
    while (this.queue.length > 0) {
      const { method, args } = this.queue.shift();
      this[method](...args);
    }
  }

  serialize(callback) {
    if (callback) {
      callback();
    }
  }

  saveToFile() {
    if (this.path !== ':memory:') {
      try {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.path, buffer);
      } catch (err) {
        console.error('Error saving SQLite database to file:', err);
      }
    }
  }

  run(sql, ...args) {
    if (!this.ready) {
      this.queue.push({ method: 'run', args: [sql, ...args] });
      return this;
    }

    let params = [];
    let callback;
    if (args.length > 0) {
      if (typeof args[args.length - 1] === 'function') {
        callback = args.pop();
      }
      if (args.length > 0) {
        params = Array.isArray(args[0]) ? args[0] : args;
      }
    }

    process.nextTick(() => {
      try {
        this.db.run(sql, params);
        
        let lastID = 0;
        let changes = 0;
        
        if (sql.trim().toUpperCase().startsWith('INSERT')) {
          const res = this.db.exec("SELECT last_insert_rowid() as id");
          if (res.length > 0 && res[0].values.length > 0) {
            lastID = res[0].values[0][0];
          }
        }
        
        this.saveToFile();

        if (callback) {
          const context = { lastID, changes };
          callback.call(context, null);
        }
      } catch (err) {
        if (callback) callback(err);
      }
    });
    return this;
  }

  get(sql, ...args) {
    if (!this.ready) {
      this.queue.push({ method: 'get', args: [sql, ...args] });
      return this;
    }

    let params = [];
    let callback;
    if (args.length > 0) {
      if (typeof args[args.length - 1] === 'function') {
        callback = args.pop();
      }
      if (args.length > 0) {
        params = Array.isArray(args[0]) ? args[0] : args;
      }
    }

    process.nextTick(() => {
      try {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        let row = null;
        if (stmt.step()) {
          row = stmt.getAsObject();
          if (Object.keys(row).length === 0) {
            row = null;
          }
        }
        stmt.free();

        if (callback) callback(null, row);
      } catch (err) {
        if (callback) callback(err, null);
      }
    });
    return this;
  }

  all(sql, ...args) {
    if (!this.ready) {
      this.queue.push({ method: 'all', args: [sql, ...args] });
      return this;
    }

    let params = [];
    let callback;
    if (args.length > 0) {
      if (typeof args[args.length - 1] === 'function') {
        callback = args.pop();
      }
      if (args.length > 0) {
        params = Array.isArray(args[0]) ? args[0] : args;
      }
    }

    process.nextTick(() => {
      try {
        const stmt = this.db.prepare(sql);
        stmt.bind(params);
        const rows = [];
        while (stmt.step()) {
          rows.push(stmt.getAsObject());
        }
        stmt.free();

        if (callback) callback(null, rows);
      } catch (err) {
        if (callback) callback(err, null);
      }
    });
    return this;
  }

  prepare(sql) {
    let stmt;
    if (this.ready) {
      stmt = this.db.prepare(sql);
    }
    
    return {
      run: (...runArgs) => {
        let params = runArgs;
        let callback;
        if (runArgs.length > 0 && typeof runArgs[runArgs.length - 1] === 'function') {
          callback = params.pop();
        }
        
        stmt.bind(params);
        stmt.step();
        
        if (callback) {
          process.nextTick(() => callback(null));
        }
        return this;
      },
      finalize: (callback) => {
        stmt.free();
        this.saveToFile();
        if (callback) {
          process.nextTick(() => callback(null));
        }
      }
    };
  }
}

module.exports = {
  Database,
  verbose: function() {
    return this;
  }
};