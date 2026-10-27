/**
 * Owner-defined semantic editing contract; snapshots must not hold reactive state.
 *
 * @typeParam Patch - Partial draft change applied to the owner draft
 * @typeParam Child - Child row type appended by the owner
 * @typeParam ChildId - Identifier used to remove a child row
 * @typeParam Field - Focusable owner field
 * @typeParam State - Draft snapshot returned to callers
 * @typeParam SubmitContext - Optional owner submit fence
 * @typeParam SubmitResult - Owner persistence result
 */
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
