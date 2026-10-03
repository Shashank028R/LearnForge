import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

describe('API Foundation & Health Endpoints', () => {
  it('GET /api/v1/health should return 200 and healthy status envelope', async () => {
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data.status).toBe('healthy');
    expect(res.body.data.service).toBe('LearnForge API');
    expect(res.body.data.version).toBe('0.1.0');
    expect(res.body.data).toHaveProperty('database');
    expect(res.headers).toHaveProperty('x-request-id');
    expect(res.body.meta.requestId).toBe(res.headers['x-request-id']);
  });

  it('GET /api/v1/unknown-endpoint should return 404 with structured error envelope', async () => {
    const res = await request(app).get('/api/v1/unknown-endpoint');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('success', false);
    expect(res.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(res.body).toHaveProperty('requestId');
  });
});
