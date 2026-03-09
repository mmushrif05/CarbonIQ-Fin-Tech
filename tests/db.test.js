const DataStore = require('../db');

// Mock Firebase database
const createMockDb = () => {
  const store = {};

  const getNestedValue = (obj, path) => {
    return path.split('/').reduce((curr, key) => (curr && curr[key] !== undefined ? curr[key] : null), obj);
  };

  const setNestedValue = (obj, path, value) => {
    const keys = path.split('/');
    let curr = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!curr[keys[i]]) curr[keys[i]] = {};
      curr = curr[keys[i]];
    }
    if (value === null) {
      delete curr[keys[keys.length - 1]];
    } else {
      curr[keys[keys.length - 1]] = value;
    }
  };

  let pushCounter = 0;

  return {
    ref: (path) => ({
      once: async () => ({
        val: () => getNestedValue(store, path),
      }),
      set: async (data) => {
        setNestedValue(store, path, data);
      },
      update: async (data) => {
        const existing = getNestedValue(store, path) || {};
        setNestedValue(store, path, { ...existing, ...data });
      },
      remove: async () => {
        setNestedValue(store, path, null);
      },
      push: async (data) => {
        const key = `push_${++pushCounter}`;
        setNestedValue(store, `${path}/${key}`, data);
        return { key };
      },
    }),
    _store: store,
  };
};

describe('DataStore', () => {
  let db;
  let dataStore;

  beforeEach(() => {
    db = createMockDb();
    dataStore = new DataStore(db);
  });

  describe('generic operations', () => {
    it('get/set round-trip', async () => {
      await dataStore.set('test/path', { hello: 'world' });
      const result = await dataStore.get('test/path');
      expect(result).toEqual({ hello: 'world' });
    });

    it('returns null for missing paths', async () => {
      const result = await dataStore.get('nonexistent/path');
      expect(result).toBeNull();
    });

    it('update merges data', async () => {
      await dataStore.set('test/merge', { a: 1, b: 2 });
      await dataStore.update('test/merge', { b: 3, c: 4 });
      const result = await dataStore.get('test/merge');
      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('remove deletes data', async () => {
      await dataStore.set('test/delete', { x: 1 });
      await dataStore.remove('test/delete');
      const result = await dataStore.get('test/delete');
      expect(result).toBeNull();
    });
  });

  describe('score operations', () => {
    it('saves and retrieves a score', async () => {
      const record = await dataStore.saveScore({
        projectName: 'Test Project',
        score: 75,
      });
      expect(record.id).toBeDefined();
      expect(record.createdAt).toBeDefined();

      const retrieved = await dataStore.getScore(record.id);
      expect(retrieved.projectName).toBe('Test Project');
      expect(retrieved.score).toBe(75);
    });
  });

  describe('PCAF operations', () => {
    it('saves and retrieves PCAF output', async () => {
      const record = await dataStore.savePcaf({
        loanId: 'LN-001',
        financedEmissions: 24000,
      });
      expect(record.id).toBeDefined();

      const retrieved = await dataStore.getPcaf(record.id);
      expect(retrieved.loanId).toBe('LN-001');
    });
  });

  describe('covenant operations', () => {
    it('saves and retrieves covenant evaluations', async () => {
      await dataStore.saveCovenant('LN-001', { status: 'compliant' });
      await dataStore.saveCovenant('LN-001', { status: 'breach' });

      const history = await dataStore.getCovenantHistory('LN-001');
      const entries = Object.values(history);
      expect(entries.length).toBe(2);
    });
  });

  describe('webhook operations', () => {
    it('saves, retrieves, and deletes webhooks', async () => {
      const webhook = await dataStore.saveWebhook('client-1', {
        url: 'https://example.com/hook',
        events: ['score.completed'],
      });
      expect(webhook.id).toBeDefined();

      const single = await dataStore.getWebhook('client-1', webhook.id);
      expect(single.url).toBe('https://example.com/hook');

      const all = await dataStore.getWebhooks('client-1');
      expect(Object.keys(all).length).toBe(1);

      await dataStore.deleteWebhook('client-1', webhook.id);
      const deleted = await dataStore.getWebhook('client-1', webhook.id);
      expect(deleted).toBeNull();
    });
  });

  describe('null database (test mode)', () => {
    it('gracefully handles null db', async () => {
      const nullStore = new DataStore(null);
      const result = await nullStore.get('any/path');
      expect(result).toBeNull();
      await nullStore.set('any/path', { data: 1 }); // should not throw
      const pushResult = await nullStore.push('any/path', { data: 1 });
      expect(pushResult).toBeNull();
    });
  });
});
