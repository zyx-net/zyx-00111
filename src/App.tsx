import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Import } from "./pages/Import";
import { Review } from "./pages/Review";
import { Config } from "./pages/Config";
import { Export } from "./pages/Export";
import { Delivery } from "./pages/Delivery";

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/import" element={<Import />} />
          <Route path="/review" element={<Review />} />
          <Route path="/config" element={<Config />} />
          <Route path="/export" element={<Export />} />
          <Route path="/delivery" element={<Delivery />} />
        </Routes>
      </Layout>
    </Router>
  );
}
