export interface OwnerNativeEditSession<
  Patch,
  Child,
  ChildId,
  Field,
  State,
  SubmitContext = void,
  SubmitResult = void,
> {
  patch(changes: Patch): void;
  addChild(child: Child): void;
  removeChild(child: ChildId): void;
  focus(field: Field): Promise<void>;
  requestSubmit(context?: SubmitContext): Promise<SubmitResult>;
  requestCancel(): void;
  readDraftState(): State;
}
