"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  createInitialWorkspace,
  isWorkspaceV2,
  migrateWorkspace,
} from "../domain/migrate-workspace";
import type { WorkspaceState } from "../domain/types";
import { validateWorkspace } from "../domain/validate-workspace";
import { dateKey } from "../lib/dates";

export type SaveStatus = "loading" | "saving" | "saved" | "error" | "conflict";

const clone = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value)) as T;

export function useWorkspacePersistence() {
  const [state, setState] = useState<WorkspaceState>(() =>
    createInitialWorkspace(),
  );
  const [status, setStatus] = useState<SaveStatus>("loading");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [canPersist, setCanPersist] = useState(false);
  const baseUpdatedAt = useRef<string | null>(null);
  const statusRef = useRef<SaveStatus>("loading");
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeVersion = useRef(0);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    let live = true;
    fetch("/api/workspace")
      .then(async (response) => {
        if (!response.ok) throw new Error("load");
        return (await response.json()) as {
          state: unknown;
          updatedAt: string | null;
        };
      })
      .then((data) => {
        if (!live) return;
        const next = migrateWorkspace(data.state, dateKey());
        const validation = validateWorkspace(next);
        if (!validation.ok) throw new Error("invalid");
        if (next.canvas.hasSavedViewport === undefined) {
          const viewport = next.canvas.viewport;
          next.canvas.hasSavedViewport =
            viewport.x !== 0 ||
            viewport.y !== 0 ||
            viewport.zoom !== 0.86;
        }
        if (data.state == null || !isWorkspaceV2(data.state)) {
          changeVersion.current += 1;
        }
        setState(next);
        baseUpdatedAt.current = data.updatedAt;
        setSavedAt(data.updatedAt);
        setStatus("saved");
        setCanPersist(true);
      })
      .catch(() => {
        if (!live) return;
        setStatus("error");
        setCanPersist(false);
      })
      .finally(() => {
        if (live) setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (
      !loaded ||
      !canPersist ||
      changeVersion.current === 0 ||
      statusRef.current === "conflict"
    ) {
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    const snapshot = clone(state);
    const snapshotVersion = changeVersion.current;
    if (!validateWorkspace(snapshot).ok) {
      timer.current = setTimeout(() => setStatus("error"), 0);
      return () => {
        if (timer.current) clearTimeout(timer.current);
      };
    }
    timer.current = setTimeout(() => {
      saveChain.current = saveChain.current.finally(async () => {
        setStatus("saving");
        try {
          const response = await fetch("/api/workspace", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              state: snapshot,
              baseUpdatedAt: baseUpdatedAt.current,
            }),
          });
          if (response.status === 409) {
            setStatus("conflict");
            return;
          }
          if (!response.ok) throw new Error("save");
          const data = (await response.json()) as { updatedAt: string };
          baseUpdatedAt.current = data.updatedAt;
          setSavedAt(data.updatedAt);
          if (changeVersion.current === snapshotVersion) {
            changeVersion.current = 0;
          }
          setStatus("saved");
        } catch {
          setStatus("error");
        }
      });
    }, 760);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [canPersist, loaded, state]);

  const mutate = useCallback((change: (draft: WorkspaceState) => void) => {
    changeVersion.current += 1;
    setState((current) => {
      const draft = clone(current);
      change(draft);
      return draft;
    });
  }, []);

  const reset = useCallback(() => {
    changeVersion.current += 1;
    setState(createInitialWorkspace());
    setStatus("saving");
  }, []);

  return {
    state,
    setState,
    mutate,
    status,
    savedAt,
    loaded,
    reset,
  };
}
