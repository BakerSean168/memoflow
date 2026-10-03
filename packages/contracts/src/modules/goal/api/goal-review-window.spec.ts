import { describe, expect, it } from 'vitest';
import { OpenAPIRegistry, OpenApiGeneratorV3 } from '@asteasolutions/zod-to-openapi';
import {
  CreateGoalReviewSchema,
  GoalReviewWindowOptionsSchema,
  GoalReviewWindowQuerySchema,
} from './goal-review.dto';

const body = { expectedVersion: 1, reflection: 'Progress' };
describe('Goal review window runtime contracts', () => {
  it('OpenAPI advertises the HTTP JSON parameter as a string', () => {
    const registry = new OpenAPIRegistry();
    registry.registerPath({
      method: 'get',
      path: '/goals/{id}/reviews/context',
      request: { query: GoalReviewWindowQuerySchema },
      responses: { 200: { description: 'OK' } },
    });
    const document = new OpenApiGeneratorV3(registry.definitions).generateDocument({
      openapi: '3.0.0',
      info: { title: 'Goal review', version: '1' },
    });
    expect(document.paths['/goals/{id}/reviews/context']?.get?.parameters).toContainEqual(
      expect.objectContaining({
        name: 'window',
        in: 'query',
        required: false,
        schema: {
          type: 'string',
          description:
            'JSON-encoded Goal review window selection (since-last-review, 7d, 30d, or custom).',
          example: '{"mode":"custom","windowStartAt":101,"windowEndAt":987}',
        },
      }),
    );
  });
  it('omitted input stays omitted for authoritative default resolution', () => {
    expect(CreateGoalReviewSchema.parse(body)).toEqual(body);
    expect(GoalReviewWindowQuerySchema.parse({})).toEqual({});
  });
  it.each([7, 30])('retains explicit legacy %i days', (windowDays) => {
    expect(CreateGoalReviewSchema.parse({ ...body, windowDays })).toEqual({ ...body, windowDays });
    expect(GoalReviewWindowQuerySchema.parse({ windowDays: String(windowDays) })).toEqual({
      windowDays,
    });
  });
  it.each([
    { mode: 'since-last-review' },
    { mode: '7d' },
    { mode: '30d' },
    { mode: 'custom', windowStartAt: 101, windowEndAt: 987 },
  ])('accepts typed selection and HTTP JSON query with identical output: %j', (window) => {
    expect(CreateGoalReviewSchema.parse({ ...body, window }).window).toEqual(window);
    expect(GoalReviewWindowQuerySchema.parse({ window }).window).toEqual(window);
    expect(GoalReviewWindowQuerySchema.parse({ window: JSON.stringify(window) }).window).toEqual(
      window,
    );
  });
  it.each([
    [1, 1],
    [2, 1],
    [NaN, 2],
    [1, Infinity],
    [0.5, 2],
    [1, 2.5],
  ])('rejects invalid custom instants %s -> %s at all boundaries', (windowStartAt, windowEndAt) => {
    const input = { window: { mode: 'custom', windowStartAt, windowEndAt } };
    expect(CreateGoalReviewSchema.safeParse({ ...body, ...input }).success).toBe(false);
    expect(GoalReviewWindowOptionsSchema.safeParse(input).success).toBe(false);
    expect(GoalReviewWindowQuerySchema.safeParse(input).success).toBe(false);
    expect(
      GoalReviewWindowQuerySchema.safeParse({ window: JSON.stringify(input.window) }).success,
    ).toBe(false);
  });
  it.each([
    '{',
    'null',
    '{"mode":"unknown"}',
    '{"mode":"custom","windowStartAt":"1","windowEndAt":2}',
    '{"mode":"7d","windowEndAt":2}',
  ])('rejects malformed or ambiguous HTTP selection %s', (window) => {
    expect(GoalReviewWindowQuerySchema.safeParse({ window }).success).toBe(false);
  });
});
