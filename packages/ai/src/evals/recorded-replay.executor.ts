import type {
  AIEvalCase,
  AIEvalConfigurationBundle,
  AIEvalExecutor,
  AIEvalObservation,
  AIEvalRecordedBundle,
} from './types';

export class RecordedReplayAIEvalExecutor implements AIEvalExecutor {
  private readonly observationsByBundle = new Map<string, Map<string, AIEvalObservation>>();

  constructor(recordings: readonly AIEvalRecordedBundle[]) {
    for (const recording of recordings) {
      this.observationsByBundle.set(
        recording.config.id,
        new Map(recording.observations.map((observation) => [observation.caseId, observation])),
      );
    }
  }

  async execute(
    bundle: AIEvalConfigurationBundle,
    evalCase: AIEvalCase,
  ): Promise<AIEvalObservation> {
    if (bundle.source !== 'recorded_replay') {
      throw new Error(`Recorded replay executor cannot execute ${bundle.source} evidence`);
    }
    const observation = this.observationsByBundle.get(bundle.id)?.get(evalCase.id);
    if (!observation)
      throw new Error(`Missing recorded observation for ${bundle.id}/${evalCase.id}`);
    return structuredClone(observation);
  }
}
