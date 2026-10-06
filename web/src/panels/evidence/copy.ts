/* C-13 LIMITATION STATEMENT (Contract 8.4, Evidence Rail): the rail must state this caveat.
   Contracts.md mandates the exact wording on this line; C-13 permits a flagged phrase only
   inside an explicit limitation statement, so the flagged word here is sanctioned. */
export const EVIDENCE_RAIL_CAVEAT = "This rail shows cumulative information, not a recommended work-up."; // c13-allow: limitation statement — contract-mandated Evidence Rail caveat, Contracts.md 8.4 L387

export const RAIL_TITLE = "Evidence Rail";
export const LADDER_LABEL = "Evidence ladder stages";
export const PANEL_LABEL = "Selected stage modalities";
export const MODALITIES_LABEL = "Modalities at this stage";

export const CUSTOM_SUBSET_LABEL = "Custom subset (unvalidated)";
export const CUSTOM_SUBSET_WARNING =
  "Cumulative-ladder validation claims no longer apply; cohort-AUC display is suppressed.";

export const BUILD_UP_LABEL = "Build Up";

export const EMPTY_STAGES_TITLE = "No stages available";
export const EMPTY_STAGES_BODY = "The evidence ladder has no stages to show yet.";
export const NO_STAGE_SELECTED =
  "No stage selected. Choose a stage to see which modalities it provides.";
export const NO_MODALITIES_SUMMARY = "No modalities are listed for this stage.";
export const NONE_PROVIDED_SUMMARY = "No modalities are provided at this stage.";
export const NO_STAGES_STATUS = "No stages available to build up.";
export const IDLE_STATUS = "Ready - select a stage, or start Build Up.";
export const DONE_STATUS = "Complete - all stages played.";

export const PROVIDED_LABEL = "Provided";
export const NOT_PROVIDED_LABEL = "Not provided";
export const CURRENT_LABEL = "current";
