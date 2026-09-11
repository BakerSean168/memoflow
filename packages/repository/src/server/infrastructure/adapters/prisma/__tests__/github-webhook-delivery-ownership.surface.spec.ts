import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GitHub webhook delivery ownership surface (stage-6 residual 110):
 * status transitions must include connectionId in the write filter —
 * never mutate by bare delivery primary key alone.
 * Residual 187: bare findById is intentional system delivery-id bootstrap only;
 * mutations always fence with connectionId; connection re-owned via loadOwnedConnectionById.
 */
describe('github webhook delivery ownership surface', () => {
  const port = readFileSync(
    resolve(__dirname, '../../../../application/ports/knowledge-note-projection.repository.ts'),
    'utf8',
  );
  const prisma = readFileSync(
    resolve(__dirname, '../github-webhook-delivery-prisma.repository.ts'),
    'utf8',
  );
  const service = readFileSync(
    resolve(
      __dirname,
      '../../../../application/services/knowledge-repository-projection.service.ts',
    ),
    'utf8',
  );

  it('port updateStatus requires connectionId', () => {
    expect(port).toMatch(
      /updateStatus\(\s*id: string,\s*connectionId: string,\s*status: GithubWebhookDeliveryStatus/,
    );
  });

  it('prisma updates filter by id + binding ownership', () => {
    expect(prisma).toMatch(
      /async updateStatus\(\s*id: string,\s*connectionId: string,\s*status: GithubWebhookDeliveryStatus/,
    );
    expect(prisma).toContain('updateMany({');
    expect(prisma).toContain('where: { id, bindingId: connectionId }');
    expect(prisma).toContain(
      "throw new Error('GitHub webhook delivery not found for the current connection.');",
    );
    // Status mutation must not use bare-primary-key update({ where: { id } }).
    expect(prisma).not.toMatch(/githubWebhookDelivery\.update\(\s*\{\s*where:\s*\{\s*id\s*\}/);
  });

  it('projection service passes delivery.connectionId into status transitions', () => {
    expect(service).toMatch(/updateStatus\(\s*deliveryId,\s*delivery\.connectionId,\s*'Ignored'/);
    expect(service).toMatch(
      /updateStatus\(\s*delivery\.id,\s*delivery\.connectionId,\s*'Processing'/,
    );
    expect(service).toMatch(
      /updateStatus\(\s*delivery\.id,\s*delivery\.connectionId,\s*'Processed'/,
    );
    expect(service).toMatch(/updateStatus\(\s*delivery\.id,\s*delivery\.connectionId,\s*'Failed'/);
    // No bare two-arg status update without connectionId fence.
    expect(service).not.toMatch(
      /deliveryRepository\.updateStatus\(\s*delivery\.id,\s*'(Processing|Processed|Failed|Ignored)'/,
    );
    expect(service).not.toMatch(
      /deliveryRepository\.updateStatus\(\s*deliveryId,\s*'(Processing|Processed|Failed|Ignored)'/,
    );
  });

  it('bare findById is system delivery bootstrap only; mutations fence the binding via connectionId (residual 187)', () => {
    // Delivery rows are system-scoped by delivery id (webhook/reconcile workers).
    // Ownership fence is connectionId on writes, not identity dual-method on reads.
    const deliveryPortMatch = port.match(
      /export interface IGithubWebhookDeliveryRepository \{([\s\S]*?)\n\}/,
    );
    expect(deliveryPortMatch).toBeTruthy();
    const deliveryPort = deliveryPortMatch![1];
    expect(deliveryPort).toContain(
      'findById(id: string): Promise<GithubWebhookDeliveryRecord | null>;',
    );
    expect(deliveryPort).not.toMatch(/findByIdForIdentity/);
    expect(deliveryPort).toMatch(
      /updateStatus\(\s*id: string,\s*connectionId: string,\s*status: GithubWebhookDeliveryStatus/,
    );

    expect(prisma).toContain(
      'async findById(id: string): Promise<GithubWebhookDeliveryRecord | null>',
    );
    expect(prisma).toContain(
      'return this.toRecord(await this.db.githubWebhookDelivery.findUnique({ where: { id } }));',
    );
    expect(prisma).toContain('where: { id, bindingId: connectionId }');
    expect(prisma).not.toMatch(/githubWebhookDelivery\.update\(\s*\{\s*where:\s*\{\s*id\s*\}/);

    // Projection processDelivery: bootstrap by delivery id, then re-own connection.
    expect(service).toContain('private async processDelivery(deliveryId: string)');
    expect(service).toContain(
      'const initial = await this.options.deliveryRepository.findById(deliveryId);',
    );
    expect(service).toContain(
      'const delivery = await this.options.deliveryRepository.findById(deliveryId);',
    );
    expect(service).toContain('loadOwnedConnectionById(delivery.connectionId)');
    const bareDeliveryLoads = service.match(/deliveryRepository\.findById\(/g);
    expect(bareDeliveryLoads).toHaveLength(2);
    // No bare PK status mutation without connectionId fence.
    expect(service).not.toMatch(
      /deliveryRepository\.updateStatus\(\s*[^,]+,\s*'(Processing|Processed|Failed|Ignored)'/,
    );
    expect(service).toMatch(/updateStatus\(\s*deliveryId,\s*delivery\.connectionId,\s*'Ignored'/);
    expect(service).toMatch(
      /updateStatus\(\s*delivery\.id,\s*delivery\.connectionId,\s*'Processing'/,
    );
    expect(service).toMatch(
      /updateStatus\(\s*delivery\.id,\s*delivery\.connectionId,\s*'Processed'/,
    );
    expect(service).toMatch(/updateStatus\(\s*delivery\.id,\s*delivery\.connectionId,\s*'Failed'/);
  });
});
