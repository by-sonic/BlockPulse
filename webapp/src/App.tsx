import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { MapDashboard } from './pages/MapDashboard';
import { ContributePage } from './pages/ContributePage';
import { About } from './pages/About';
import { Footer } from './components/Footer';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="pt-20">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapDashboard />} />
          <Route path="/contribute" element={<ContributePage />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
      <Footer />
    </BrowserRouter>
  );
}
