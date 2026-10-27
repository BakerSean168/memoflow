import type { Result } from '@memoflow/transport-contracts/result';
import type { AICapabilities } from '@memoflow/ai-contracts';

interface AICapabilitiesControllerService {
  getCapabilities(): Promise<Result<AICapabilities>>;
}

export class AICapabilitiesController {
  constructor(private readonly service: AICapabilitiesControllerService) {}

  async get(): Promise<Result<AICapabilities>> {
    return this.service.getCapabilities();
  }
}
