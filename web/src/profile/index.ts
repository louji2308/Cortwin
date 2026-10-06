/**
 * Profile entry point (P6 Explore core): the registry-driven patient input
 * form and its prop contract. The P6 shell binds these props to the C-09
 * store slices; the form itself stays prop-driven and store-free.
 */
export { ProfileForm } from "./ProfileForm";
export type { ProfileFormProps } from "./types";
export {
  buildProfileViewModel,
  isDraftLive,
  type DraftChange,
  type Drafts,
  type FieldControlVm,
  type FieldDraft,
  type FieldVm,
  type ProfileViewModel,
  type SectionVm
} from "./view";
export {
  commitBinary,
  commitChoice,
  commitFeatureProvided,
  commitModalityProvided,
  commitSelection,
  commitTextEdit,
  type DispatchPort,
  type EditOutcome
} from "./handlers";
