interface AuthorityReader {
  readStatus(identityId: string): Promise<string | null>;
  hasActiveClosure(identityId: string): Promise<boolean>;
}

/** Account owns the active/closing decision used by external credential admission. */
export class IsAccountActiveUseCase {
  constructor(private readonly reader: AuthorityReader) {}

  async execute(identityId: string): Promise<boolean> {
    const [status, closing] = await Promise.all([
      this.reader.readStatus(identityId),
      this.reader.hasActiveClosure(identityId),
    ]);
    return status === 'Active' && !closing;
  }
}
