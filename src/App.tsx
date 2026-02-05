import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AuthWrapper from './components/AuthWrapper';
import AnimatedRoutes from './components/AnimatedRoutes';
import { AbstractLines } from './components/ui/AbstractLines';
import { EnhancedBackground } from './components/ui/EnhancedBackground';
import { AdvancedBackground } from './components/ui/AdvancedBackground';

function App() {
  return (
    <AuthProvider>
      <Router>
        <AbstractLines />
        <EnhancedBackground />
        <AdvancedBackground />
        <AuthWrapper>
          <AnimatedRoutes />
        </AuthWrapper>
      </Router>
    </AuthProvider>
  );
}

export default App;
