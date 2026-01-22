import { useCallback, useEffect, useRef, useState } from "react";
import { fetchMatchCommentary, fetchMatches } from "../services/api";
import { Commentary, Match, WSMessage } from "../types";
import { useWebSocket } from "./useWebSocket";

interface UseMatchData {
  matches: Match[];
  isLoading: boolean;
  error: string | null;
  commentary: Commentary[];
  isCommentaryLoading: boolean;
  wsError: string | null;
  status: ReturnType<typeof useWebSocket>["status"];
  activeMatchId: ReturnType<typeof useWebSocket>["activeMatchId"];
  watchMatch: (id: string | number) => void;
  reloadMatches: () => void;
}

export const useMatchData = (): UseMatchData => {
  const [matches, setMatches] = useState<Match[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentary, setCommentary] = useState<Commentary[]>([]);
  const [isCommentaryLoading, setIsCommentaryLoading] = useState(false);
  const [wsError, setWsError] = useState<string | null>(null);
  const latestMatchIdRef = useRef<string | number | null>(null);

  const handleWSMessage = useCallback((msg: WSMessage) => {
    switch (msg.type) {
      case "score_update":
        setMatches((prevMatches) =>
          prevMatches.map((m) => {
            // Loose equality check for ID (string vs number)
            // eslint-disable-next-line eqeqeq
            if (m.id == msg.matchId) {
              return {
                ...m,
                homeScore: msg.data.homeScore,
                awayScore: msg.data.awayScore,
              };
            }
            return m;
          })
        );
        break;
      case "commentary": {
        if (
          latestMatchIdRef.current == null ||
          msg.data.matchId != latestMatchIdRef.current
        ) {
          return;
        }
        const normalized = {
          ...msg.data,
          createdAt: msg.data.createdAt ?? new Date().toISOString(),
        };
        setCommentary((prev) => [normalized, ...prev]);
        break;
      }
      case "error":
        setWsError(`${msg.code}: ${msg.message}`);
        break;
      case "subscribed":
      case "unsubscribed":
      case "subscriptions":
      case "welcome":
      case "pong":
        break;
      default:
        break;
    }
  }, []);

  const { status, connect, activeMatchId } = useWebSocket(handleWSMessage);

  const loadMatches = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchMatches(50);
      setMatches(data.data || []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load matches";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatches();
  }, [loadMatches]);

  useEffect(() => {
    latestMatchIdRef.current = activeMatchId;
  }, [activeMatchId]);

  const watchMatch = useCallback(
    (id: string | number) => {
      setCommentary([]);
      setIsCommentaryLoading(true);
      setWsError(null);
      latestMatchIdRef.current = id;
      connect(id);
      fetchMatchCommentary(id)
        .then((data) => {
          if (latestMatchIdRef.current == id) {
            setCommentary(data.data || []);
          }
        })
        .catch(() => {
          if (latestMatchIdRef.current == id) {
            setCommentary([]);
          }
        })
        .finally(() => {
          if (latestMatchIdRef.current == id) {
            setIsCommentaryLoading(false);
          }
        });
    },
    [connect]
  );

  return {
    matches,
    isLoading,
    error,
    commentary,
    isCommentaryLoading,
    wsError,
    status,
    activeMatchId,
    watchMatch,
    reloadMatches: loadMatches,
  };
};
