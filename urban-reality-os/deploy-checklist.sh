#!/bin/bash
# ================================================
# Urban Intelligence OS — Deploy Checklist
# ================================================
# Verify all components are in place before deployment
# Run: bash deploy-checklist.sh

echo "🔍 Urban Intelligence OS - Deploy Checklist"
echo "================================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✅${NC} $1"
    return 0
  else
    echo -e "${RED}❌${NC} $1"
    return 1
  fi
}

# ── Engines ──
echo -e "${YELLOW}Core Engines:${NC}"
check_file "src/engines/PredictionEngine.js"
check_file "src/engines/SatelliteEngine.js"
check_file "src/engines/PlanningEngine.js"
check_file "src/engines/BuildEngine.js"
check_file "src/engines/AIAssistant.js"

# ── Workers ──
echo -e "\n${YELLOW}Web Workers:${NC}"
check_file "src/workers/predictionWorker.js"
check_file "src/workers/satelliteWorker.js"
check_file "src/workers/planningWorker.js"

# ── Layer Plugins ──
echo -e "\n${YELLOW}Layer Plugins:${NC}"
check_file "src/layers/PredictionLayerPlugin.js"
check_file "src/layers/NDVILayerPlugin.js"
check_file "src/layers/PlanningLayerPlugin.js"
check_file "src/layers/BuildLayerPlugin.js"
check_file "src/layers/LayerRegistry.js"

# ── UI Components ──
echo -e "\n${YELLOW}UI Components:${NC}"
check_file "src/components/BuilderUI.jsx"
check_file "src/components/BuilderUI.module.css"
check_file "src/components/InsightsPanel.jsx"
check_file "src/components/InsightsPanel.module.css"
check_file "src/components/PredictionViewer.jsx"
check_file "src/components/PredictionViewer.module.css"
check_file "src/components/UrbanIntelligenceUI.jsx"
check_file "src/components/UrbanIntelligenceUI.module.css"

# ── Hooks ──
echo -e "\n${YELLOW}Integration Hooks:${NC}"
check_file "src/hooks/useUrbanIntelligence.js"

# ── Documentation ──
echo -e "\n${YELLOW}Documentation:${NC}"
check_file "URBAN_INTELLIGENCE_INTEGRATION.md"
check_file "ARCHITECTURE_REFERENCE.md"
check_file "INTEGRATION_SUMMARY.md"
check_file "integrationTest.js"

# ── Updated MapView ──
echo -e "\n${YELLOW}Integration Points:${NC}"
grep -q "useUrbanIntelligence" src/components/MapView.jsx && echo -e "${GREEN}✅${NC} MapView imports useUrbanIntelligence" || echo -e "${RED}❌${NC} MapView missing useUrbanIntelligence import"
grep -q "UrbanIntelligenceUI" src/components/MapView.jsx && echo -e "${GREEN}✅${NC} MapView mounts UrbanIntelligenceUI component" || echo -e "${RED}❌${NC} MapView missing UrbanIntelligenceUI component"

echo ""
echo "================================================"
echo -e "${GREEN}🎉 Checklist Complete!${NC}"
echo ""
echo "Quick Start:"
echo "1. npm install (if new dependencies)"
echo "2. npm run dev"
echo "3. Open browser console"
echo "4. Run: window.__URBAN_INTELLIGENCE_TEST__.quickHealthCheck()"
echo "5. If all green, system is ready!"
echo ""
