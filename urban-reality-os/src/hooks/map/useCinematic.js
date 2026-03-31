import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Global event dispatcher for cinematic mode.
 * Decoupled from React to allow low-level map functions to trigger it.
 */
export function emitCinematic(active) {
    window.dispatchEvent(
        new CustomEvent("cinematic-mode", { detail: { active: !!active } })
    );
}

export function useCinematic() {
    const [isCinematic, setIsCinematic] = useState(false);
    const timeoutIdsRef = useRef([]);

    // 🔥 PERF: Listener setup runs ONCE — no churn on state change
    useEffect(() => {
        const handleCinematic = (e) => setIsCinematic(!!e.detail.active);
        window.addEventListener("cinematic-mode", handleCinematic);

        return () => {
            window.removeEventListener("cinematic-mode", handleCinematic);
            document.body.classList.remove("cinematic");
            // ✅ Fix: clear all running timeouts on unmount
            timeoutIdsRef.current.forEach(clearTimeout);
            timeoutIdsRef.current = [];
        };
    }, []);

    // Sync DOM class to React state (separate effect — only runs when state changes)
    useEffect(() => {
        document.body.classList.toggle("cinematic", isCinematic);
    }, [isCinematic]);

    const startCityFlyThrough = useCallback((map, defaultPath) => {
        if (!map) return;
        emitCinematic(true);

        // ✅ Fix: clear any previous timeouts before starting new chain
        timeoutIdsRef.current.forEach(clearTimeout);
        timeoutIdsRef.current = [];

        defaultPath.forEach((step, i) => {
            const id = setTimeout(() => {
                map.easeTo({
                    ...step,
                    duration: 2500,
                    easing: (t) => t * (2 - t)
                });

                if (i === defaultPath.length - 1) {
                    const endId = setTimeout(() => emitCinematic(false), 2600);
                    timeoutIdsRef.current.push(endId);
                }
            }, i * 2600);
            timeoutIdsRef.current.push(id);
        });
    }, []);

    const streetLevelView = useCallback((map, lngLat) => {
        if (!map || !lngLat) return;
        emitCinematic(true);
        map.easeTo({
            center: [lngLat.lng, lngLat.lat],
            zoom: 17,
            pitch: 80,
            bearing: Math.random() * 360,
            duration: 1800
        });
        const id = setTimeout(() => emitCinematic(false), 2000);
        timeoutIdsRef.current.push(id);
    }, []);

    return {
        isCinematic,
        emitCinematic,
        startCityFlyThrough,
        streetLevelView
    };
}
