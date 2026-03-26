import { useState, useEffect } from "react";
import LocationPopup from "./LocationPopup";

export default function ResponsiveLocationPanel({ show, onClose, map, ...props }) {
    const [open, setOpen] = useState(true);

    // Sync internal open state with the show prop
    useEffect(() => {
        if (show) setOpen(true);
    }, [show]);

    if (!show) return null;

    return (
        <>
            {/* Desktop Panel - Fixed on the right */}
            <div className="hidden md:block fixed right-4 top-24 z-50 transition-all duration-300 transform scale-100 hover:scale-[1.01]">
                <div className="relative">
                    <button
                        onClick={onClose}
                        className="absolute -left-3 -top-3 w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center border border-slate-700 hover:bg-slate-700 z-[60] shadow-lg"
                    >
                        ✕
                    </button>
                    <LocationPopup {...props} />
                </div>
            </div>

            {/* Mobile Bottom Sheet */}
            <div
                className={`md:hidden fixed bottom-0 left-0 right-0 z-50 
        transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1)
        ${open ? "translate-y-0" : "translate-y-[85%]"}`}
            >
                {/* Drag Handle Container */}
                <div
                    className="bg-slate-950/80 backdrop-blur-md rounded-t-3xl pt-3 pb-1 border-t border-slate-800 cursor-pointer shadow-[0_-10px_20px_-5px_rgba(0,0,0,0.3)]"
                    onClick={() => setOpen(!open)}
                >
                    <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-600 mb-2" />
                </div>

                {/* Content Area */}
                <div className="bg-slate-950 px-4 pb-8 max-h-[80vh] overflow-y-auto">
                    <div className="relative pt-2">
                        <LocationPopup {...props} />
                    </div>
                </div>

                {/* Close Button Mobile */}
                {open && (
                    <button
                        onClick={onClose}
                        className="absolute right-4 top-4 w-10 h-10 rounded-full bg-slate-800/80 text-white flex items-center justify-center border border-slate-700"
                    >
                        ✕
                    </button>
                )}
            </div>

            {/* Loading Overlay Integration (User request 5.C) */}
            {props.analysisLoading && (
                <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] pointer-events-none z-40 hidden md:block" />
            )}
        </>
    );
}
