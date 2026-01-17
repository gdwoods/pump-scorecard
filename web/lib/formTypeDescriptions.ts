/**
 * SEC Form Type Descriptions
 * Provides tooltip descriptions for SEC filing form types
 */

export const FORM_TYPE_DESCRIPTIONS: Record<string, string> = {
  "S-1": "Initial registration statement for new securities offerings. Companies must file this before selling new shares to the public. Often indicates a capital raise or IPO.",
  
  "S-1/A": "Amendment to S-1 registration statement. Updates or revises information in a previously filed S-1. May contain pricing or offering details.",
  
  "S-3": "Shelf registration statement for seasoned issuers. Allows companies to sell securities 'off the shelf' over time without filing a new registration each time. More flexible than S-1.",
  
  "S-3/A": "Amendment to S-3 shelf registration. Updates information in a previously filed S-3.",
  
  "424B4": "Prospectus supplement filed under Rule 424(b)(4). Provides specific pricing and offering details for a shelf registration or other offering. Often contains the actual dilution amounts.",
  
  "424B5": "Prospectus supplement filed under Rule 424(b)(5). Similar to 424B4, provides pricing and offering details. May indicate active capital raising.",
  
  "8-K": "Current report filed to announce significant corporate events. May include material changes, acquisitions, executive changes, or other events that could affect share price.",
  
  "8-K/A": "Amendment to 8-K current report. Updates or corrects information in a previously filed 8-K.",
  
  "10-Q": "Quarterly report filed by public companies. Contains unaudited financial statements and management discussion. Less relevant for dilution alerts but may contain relevant information.",
  
  "10-K": "Annual report filed by public companies. Contains audited financial statements and comprehensive company information. Less relevant for dilution alerts but may contain relevant information.",
};

/**
 * Get description for a form type
 */
export function getFormTypeDescription(formType: string): string {
  // Try exact match first
  if (FORM_TYPE_DESCRIPTIONS[formType]) {
    return FORM_TYPE_DESCRIPTIONS[formType];
  }
  
  // Try case-insensitive match
  const upperFormType = formType.toUpperCase();
  for (const [key, description] of Object.entries(FORM_TYPE_DESCRIPTIONS)) {
    if (key.toUpperCase() === upperFormType) {
      return description;
    }
  }
  
  // Try partial match (e.g., "S-1/A" -> "S-1")
  for (const [key, description] of Object.entries(FORM_TYPE_DESCRIPTIONS)) {
    if (upperFormType.includes(key.toUpperCase()) || key.toUpperCase().includes(upperFormType)) {
      return description;
    }
  }
  
  // Default fallback
  return `SEC filing form type: ${formType}`;
}
