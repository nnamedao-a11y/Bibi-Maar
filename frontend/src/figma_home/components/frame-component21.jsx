/**
 * FrameComponent21 — "Top vehicles deals of the week" cards grid.
 *
 * Phase B1 — Frontend pagination + cache hardening
 * ------------------------------------------------
 *   • `offset` → `skip` (backend reads `skip`; `offset` was silently dropped
 *     so every "More vehicles +" used to return the same first 6 cards).
 *   • Pagination is **accumulating** — each page is its own React Query
 *     cache entry; we slice `(0 … loadedPages × PAGE_SIZE)` for render.
 *   • One QueryClient at root means back-navigation re-uses the cached
 *     pages without re-hitting the network for 5 minutes.
 *   • All card thumbnails go through `optimizeImage()` via the downstream
 *     `<Card1>` component (already wrapped — see card1.jsx).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import Card1 from "./card1";
import { userEngagementApi } from "../../lib/api";
import { useTiltParallax } from "../../components/useTiltParallax";
import useInView from "../../components/useInView";
import { useLang } from "../../i18n";
import styles from "./frame-component21.module.css";

const API = process.env.REACT_APP_BACKEND_URL || "";

const PLACEHOLDER_IMGS = [
  "/figma/image-15@2x.webp",
  "/figma/image-151@2x.webp",
  "/figma/image-152@2x.webp",
  "/figma/image-153@2x.webp",
  "/figma/image-154@2x.webp",
  "/figma/image-155@2x.webp",
];

const FrameComponent21 = ({ className = "" }) => {
  // Welcome page is backed by the full /api/public/vehicles catalogue.
  // Start at 6 cards (2 rows × 3 cols), load 6 more per "MORE VEHICLES +".
  const PAGE_SIZE = 6;
  const [loadedPages, setLoadedPages] = useState(1);
  const { lang } = useLang();
  const isBg = lang === "bg";
  const queryClient = useQueryClient();

  // Selection sets propagated to Card1
  const [favSet, setFavSet] = useState(new Set());
  const [cmpSet, setCmpSet] = useState(new Set());
  const [cmpCount, setCmpCount] = useState(0);

  // Phase B1 — Per-page React Query: one cache entry per page so back-nav
  // and re-mount don't refetch already-seen pages.
  const pageQueries = [];
  for (let p = 1; p <= loadedPages; p++) {
    pageQueries.push(p);
  }

  // Active page query — only the current "tip" page actually has
  // `enabled=true` for fetching; earlier pages are read from cache.
  const currentPageQ = useQuery({
    queryKey: ["welcome/vehicles", { limit: PAGE_SIZE, skip: (loadedPages - 1) * PAGE_SIZE }],
    queryFn: async ({ signal }) => {
      const skip = (loadedPages - 1) * PAGE_SIZE;
      const { data } = await axios.get(`${API}/api/public/vehicles`, {
        params: { limit: PAGE_SIZE, skip },
        signal,
        timeout: 18000,
      });
      return {
        items: Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : [],
        total: Number.isFinite(data?.total) ? Number(data.total) : 0,
      };
    },
    placeholderData: (prev) => prev,
  });

  // Merge all loaded pages (1…loadedPages) into a single ordered list.
  // Earlier pages come straight from the React Query cache (no refetch).
  const items = useMemo(() => {
    const acc = [];
    for (let p = 1; p <= loadedPages; p++) {
      const cached = queryClient.getQueryData([
        "welcome/vehicles",
        { limit: PAGE_SIZE, skip: (p - 1) * PAGE_SIZE },
      ]);
      if (cached?.items?.length) acc.push(...cached.items);
    }
    return acc;
  }, [loadedPages, currentPageQ.data, queryClient]);

  const total = currentPageQ.data?.total || 0;
  const loadingMore = currentPageQ.isFetching;
  const error = currentPageQ.isError ? (currentPageQ.error?.message || "fetch failed") : null;

  const onLoadMore = useCallback(() => {
    if (loadingMore) return;
    setLoadedPages((p) => p + 1);
  }, [loadingMore]);

  /* ── Load favorites + compare once (silent on guest) ─────────────── */
  const loadEngagement = useCallback(async () => {
    try {
      const favs = await userEngagementApi.favorites.getMine();
      if (Array.isArray(favs)) {
        setFavSet(new Set(favs.map((f) => (f.vin || f.vehicleId || "").toUpperCase()).filter(Boolean)));
      }
    } catch {/* unauth or API down → leave empty */}
    try {
      const cmp = await userEngagementApi.compare.getMine();
      const list = Array.isArray(cmp) ? cmp : (cmp?.items || []);
      const ids = list.map((c) => (c.vin || c.vehicleId || "").toUpperCase()).filter(Boolean);
      setCmpSet(new Set(ids));
      setCmpCount(ids.length);
    } catch {/* leave empty */}
  }, []);

  useEffect(() => { loadEngagement(); }, [loadEngagement]);

  /* ── Optimistic toggles propagated from Card1 ─────────────────────── */
  const handleToggleFavorite = useCallback((vin, next) => {
    if (!vin) return;
    const v = vin.toUpperCase();
    setFavSet((prev) => {
      const ns = new Set(prev);
      if (next) ns.add(v); else ns.delete(v);
      return ns;
    });
  }, []);

  const handleToggleCompare = useCallback((vin, next) => {
    if (!vin) return;
    const v = vin.toUpperCase();
    setCmpSet((prev) => {
      const ns = new Set(prev);
      if (next) ns.add(v); else ns.delete(v);
      return ns;
    });
    setCmpCount((c) => Math.max(0, c + (next ? 1 : -1)));
  }, []);

  /* ── Build rows ───────────────────────────────────────────────────── */
  const live = items.length > 0 ? items : null;
  const visibleCount = live ? live.length : 6;
  const rows = [];
  if (live) {
    for (let i = 0; i < live.length; i += 3) rows.push(live.slice(i, i + 3));
  } else {
    rows.push([0, 1, 2]);
    rows.push([3, 4, 5]);
  }
  // Show "more vehicles +" while server still has unloaded pages.
  const hasMoreToShow = live ? (live.length < total) : false;

  // Reusable BIBI tilt-parallax for the car cards. The `:scope .${...}`
  // selector reaches into both rows since the IO is one-shot per card.
  // Pass `live` + `expanded` as deps so the hook re-attaches when async
  // data arrives or the "More vehicles" toggle reveals additional cards.
  const blockRef = useRef(null);
  useTiltParallax(blockRef, {
    cardsSelector: `:scope .${styles.carBlock}`,
    skipEntry: true,
    deps: [live, loadedPages],
  });

  // Viewport observer for the section — flips `inView` once the deals
  // grid scrolls into view, then triggers the stagger reveal.
  const [sectionRef, inView] = useInView();
  // Track previously-revealed count so the second batch (cards 7-12)
  // staggers independently of the first when the user clicks "More".
  const prevCountRef = useRef(6);
  const prevCount = prevCountRef.current;
  prevCountRef.current = visibleCount;

  return (
    <div ref={sectionRef} className={[styles.cardsBlockWrapper, className, inView ? "is-visible" : ""].join(" ")}>
      <div ref={blockRef} className={`${styles.cardsBlock} tilt-scope`}>
        {rows.map((row, ri) => (
          <div className={styles.cardsParent} key={`row-${ri}`}>
            {row.map((cell, ci) => {
              const cardIdx = ri * 3 + ci;
              const isFresh = cardIdx >= prevCount;
              const delayIdx = isFresh ? (cardIdx - prevCount) : (cardIdx % 6);
              /* 140 ms stagger step (instead of 100 ms) gives a clearly
               * visible left-to-right wave across the 3-card row — same
               * timing language as the hero per-char wave and the
               * filter-row chips above. */
              const animStyle = { animationDelay: `${delayIdx * 140}ms` };
              if (live) {
                const v = cell;
                return (
                  <section
                    className={`${styles.carBlock} reveal reveal--fade-up`}
                    style={animStyle}
                    key={v.vin || `${ri}-${ci}`}
                  >
                    <Card1
                      data={v}
                      favoriteSet={favSet}
                      compareSet={cmpSet}
                      compareCount={cmpCount}
                      onToggleFavoriteLocal={handleToggleFavorite}
                      onToggleCompareLocal={handleToggleCompare}
                    />
                  </section>
                );
              }
              const idx = typeof cell === "number" ? cell : cardIdx;
              return (
                <section
                  className={`${styles.carBlock} reveal reveal--fade-up`}
                  style={animStyle}
                  key={`ph-${idx}`}
                >
                  <Card1 image15={PLACEHOLDER_IMGS[idx % PLACEHOLDER_IMGS.length]} />
                </section>
              );
            })}
          </div>
        ))}

        {hasMoreToShow && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 0 0", gap: 6 }}>
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              data-testid="top-deals-more-toggle"
              style={{
                background: "transparent", border: 0, color: "#FEAE00",
                fontFamily: "var(--font-mazzard)", fontSize: 18, fontWeight: 500,
                letterSpacing: "0.06em", textTransform: "uppercase",
                textDecoration: "underline", cursor: loadingMore ? "wait" : "pointer", padding: "8px 12px",
                opacity: loadingMore ? 0.5 : 1,
              }}
            >
              {loadingMore
                ? (isBg ? "зареждам…" : "loading…")
                : (isBg ? "още автомобили +" : "more vehicles +")}
            </button>
            {total > 0 && (
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.04em" }}>
                {isBg
                  ? `${visibleCount} / ${total} автомобила`
                  : `${visibleCount} of ${total} vehicles`}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FrameComponent21;
