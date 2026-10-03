import { useCallback, useEffect, useRef, useState } from "react";

import type { TradeView } from "./tabs";

const BATCH_MS = 250;

/*
 * Turns the polled trade list into what the list shows. Trades newer than the top row
 * are queued and inserted at most once every 250ms: a lone trade gets the insert
 * animation (`fresh`), a batch goes in together without it. While `paused` (scrolled
 * down or touching) they wait and `pending` counts them; `resume` inserts them at once.
 * Older trades from the next page are appended straight away. `resetKey` (the filter)
 * starts over.
 */
export const useLiveTrades = (
  source: TradeView[],
  paused: boolean,
  resetKey: string,
) => {
  const [shown, setShown] = useState<TradeView[]>([]);
  const [fresh, setFresh] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const queue = useRef<TradeView[]>([]);
  const lastInsert = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = useRef(resetKey);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  const insert = useCallback(() => {
    timer.current = null;
    const batch = queue.current;
    if (batch.length === 0) return;
    queue.current = [];
    lastInsert.current = Date.now();
    setPending(0);
    setFresh(batch.length === 1 ? batch[0].id : null);
    setShown((rows) => [...batch, ...rows]);
  }, []);

  const schedule = useCallback(() => {
    if (timer.current || queue.current.length === 0) return;
    const wait = Math.max(0, BATCH_MS - (Date.now() - lastInsert.current));
    timer.current = setTimeout(insert, wait);
  }, [insert]);

  useEffect(() => {
    if (key.current !== resetKey) {
      key.current = resetKey;
      queue.current = [];
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      setPending(0);
      setFresh(null);
      setShown(source);
      return;
    }
    const rows = shownRef.current;
    if (rows.length === 0) {
      setShown(source);
      return;
    }
    const known = new Set([...rows, ...queue.current].map((t) => t.id));
    const newer: TradeView[] = [];
    for (const t of source) {
      if (known.has(t.id)) break;
      newer.push(t);
    }
    const older = source.filter(
      (t) => !known.has(t.id) && t.at <= rows[rows.length - 1].at,
    );
    if (older.length)
      setShown((list) => [...list, ...older.filter((t) => !newer.includes(t))]);
    if (newer.length) {
      queue.current = [...newer, ...queue.current];
      if (paused) setPending(queue.current.length);
      else schedule();
    }
  }, [source, paused, resetKey, schedule]);

  useEffect(() => {
    if (!paused) schedule();
  }, [paused, schedule]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /* Insert everything waiting now, without animation. */
  const resume = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const batch = queue.current;
    queue.current = [];
    setPending(0);
    setFresh(null);
    if (batch.length) setShown((rows) => [...batch, ...rows]);
  }, []);

  return { rows: shown, fresh, pending, resume };
};
