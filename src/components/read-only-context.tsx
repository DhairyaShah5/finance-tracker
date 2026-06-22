"use client";

import * as React from "react";

const ReadOnlyContext = React.createContext(false);

export function ReadOnlyProvider({
  readOnly,
  children,
}: {
  readOnly: boolean;
  children: React.ReactNode;
}) {
  return <ReadOnlyContext.Provider value={readOnly}>{children}</ReadOnlyContext.Provider>;
}

/** True when the page is being viewed read-only (no signed-in owner). */
export function useReadOnly(): boolean {
  return React.useContext(ReadOnlyContext);
}
