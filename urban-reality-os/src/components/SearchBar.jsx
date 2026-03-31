import { useState, useRef, useEffect, memo } from "react";

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || "UQBNCVHquLf1PybiywBt"; // Fallback to avoid breaking

const SearchBar = memo(function SearchBar({ mapRef, onLocationSelect }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        searchRef.current &&
        !searchRef.current.contains(event.target) &&
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search function
  const searchLocations = async (query, signal) => {
    if (!query || query.length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(
        `https://api.maptiler.com/geocoding/${encodeURIComponent(query)}.json?key=${MAPTILER_KEY}&limit=5&country=in`,
        { signal }
      );

      if (!response.ok) throw new Error("Geocoding failed");

      const data = await response.json();

      if (data.features && data.features.length > 0) {
        setSuggestions(data.features);
        setShowSuggestions(true);
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
      }
    } catch (error) {
      if (error.name === "AbortError") return; // Ignore aborted request errors
      console.error("Search error:", error);
      setSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsLoading(false);
    }
  };

  // Debounce function with AbortController
  useEffect(() => {
    const abortController = new AbortController();
    
    const timer = setTimeout(() => {
      searchLocations(searchQuery, abortController.signal);
    }, 300);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [searchQuery]);

  const handleSelectLocation = (feature) => {
    const [lng, lat] = feature.geometry.coordinates;
    const placeName = feature.place_name || feature.text || "Selected Location";

    setSearchQuery(placeName);
    setShowSuggestions(false);
    setSuggestions([]);

    // Fly to location
    if (mapRef.current && onLocationSelect) {
      onLocationSelect(lng, lat, placeName);
    }
  };

  const handleInputChange = (e) => {
    setSearchQuery(e.target.value);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleClear = () => {
    setSearchQuery("");
    setSuggestions([]);
    setShowSuggestions(false);
  };

  return (
    <div
      ref={searchRef}
      style={{
        position: "absolute",
        top: 20,
        left: 200, // Positioned to the right of LayerToggle (160px width + 40px gap)
        zIndex: 11,
        width: 400,
      }}
    >
      {/* Search Input */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          background: "rgba(15, 23, 42, 0.95)", // Dark background
          borderRadius: "24px",
          boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
          transition: "box-shadow 0.2s",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(8px)"
        }}
        onFocus={() => {
          const input = document.getElementById("search-input");
          if (input) input.parentElement.style.boxShadow = "0 6px 16px rgba(0,0,0,0.5)";
        }}
        onBlur={() => {
          const input = document.getElementById("search-input");
          if (input) input.parentElement.style.boxShadow = "0 4px 12px rgba(0,0,0,0.4)";
        }}
      >
        {/* Search Icon */}
        <div
          style={{
            padding: "0 16px",
            display: "flex",
            alignItems: "center",
            color: "#94a3b8",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </div>

        {/* Input Field */}
        <input
          id="search-input"
          type="text"
          value={searchQuery}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          placeholder="Search for a location..."
          style={{
            flex: 1,
            border: "none",
            outline: "none",
            padding: "12px 8px",
            fontSize: "15px",
            color: "#f8fafc",
            background: "transparent",
            "placeholder": { color: "#64748b" }
          }}
        />

        {/* Clear Button */}
        {searchQuery && (
          <button
            onClick={handleClear}
            style={{
              padding: "0 12px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#94a3b8",
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          </button>
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div
            style={{
              padding: "0 12px",
              display: "flex",
              alignItems: "center",
            }}
          >
            <div
              style={{
                width: "16px",
                height: "16px",
                border: "2px solid #94a3b8",
                borderTopColor: "#3b82f6",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div
          ref={suggestionsRef}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: "8px",
            background: "rgba(15, 23, 42, 0.98)", // Dark
            borderRadius: "12px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            maxHeight: "400px",
            overflowY: "auto",
            zIndex: 1000,
          }}
        >
          {suggestions.map((feature, index) => (
            <div
              key={index}
              onClick={() => handleSelectLocation(feature)}
              style={{
                padding: "12px 16px",
                cursor: "pointer",
                borderBottom: index < suggestions.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.1)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {/* Location Icon */}
              <div
                style={{
                  paddingTop: "2px",
                  color: "#94a3b8",
                  flexShrink: 0,
                }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>

              {/* Location Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "15px",
                    color: "#f8fafc",
                    fontWeight: 500,
                    marginBottom: "2px",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {feature.text || "Unknown"}
                </div>
                <div
                  style={{
                    fontSize: "13px",
                    color: "#94a3b8",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {feature.properties?.address || feature.place_name || ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
});

export default SearchBar;