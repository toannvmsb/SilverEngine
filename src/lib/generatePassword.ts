import { randomBytes } from "crypto";

/** Temporary password shown once to the admin creating/resetting an account — never stored in plaintext. */
export function generateTempPassword(): string {
  // Over-generate then strip +/= (which base64 can produce) so we reliably
  // end up with >=12 usable characters, rather than risking a shorter
  // password when those characters happen to get stripped.
  let chars = "";
  while (chars.length < 12) {
    chars += randomBytes(16).toString("base64").replace(/[+/=]/g, "");
  }
  return chars.slice(0, 12);
}
