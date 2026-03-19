import { useEffect, useLayoutEffect } from "react";

export const wait = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;