'use client';

import { AppProgressBar } from 'next-nprogress-bar';

export function ProgressBar() {
  return (
    <AppProgressBar
      height="3px"
      color="#0284c7"
      options={{ showSpinner: false }}
      shallowRouting
    />
  );
}
