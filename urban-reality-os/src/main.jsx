import React, { Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { AuthProvider } from "./context/AuthContext";
import { GoogleOAuthProvider } from "@react-oauth/google";

import { addResourceHints } from "./utils/performance";

// Inject DNS prefetch and preconnect tags early
addResourceHints();

// Lazy load heavy MapView component
const MapView = lazy(() => import("./components/MapView"));

const GOOGLE_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Loading fallback component
const LoadingFallback = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    background: '#0f172a',
    color: '#fff',
    fontSize: '18px',
    fontFamily: 'system-ui'
  }}>
    <div>
      <div style={{ marginBottom: '20px' }}>🗺️ Loading Urban Reality OS...</div>
      <div style={{ fontSize: '12px', color: '#94a3b8' }}>Initializing map and data layers</div>
    </div>
  </div>
);

const root = ReactDOM.createRoot(document.getElementById("root"));

// Optimized AppWrapper with Google OAuth
const AppWrapper = ({ children }) => {
  if (GOOGLE_ID) {
    return (
      <GoogleOAuthProvider clientId={GOOGLE_ID}>
        {children}
      </GoogleOAuthProvider>
    );
  }
  return children;
};

const appTree = (
  <AppWrapper>
    <AuthProvider>
      <Suspense fallback={<LoadingFallback />}>
        <MapView />
      </Suspense>
    </AuthProvider>
  </AppWrapper>
);

root.render(
  import.meta.env.DEV ? (
    <React.StrictMode>
      {appTree}
    </React.StrictMode>
  ) : (
    appTree
  )
);
