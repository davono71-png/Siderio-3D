import { Navigate, Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { OfficePage } from "./pages/OfficePage";
import { WorkshopPage } from "./pages/WorkshopPage";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/c/:slug" element={<WorkshopPage />} />
      <Route path="/viewer/:slug" element={<WorkshopPage />} />
      <Route path="/office/:slug" element={<OfficePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
