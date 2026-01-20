import { BrowserRouter as Router } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import AuthWrapper from './components/AuthWrapper';
import AnimatedRoutes from './components/AnimatedRoutes';

function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthWrapper>
          <AnimatedRoutes />
        </AuthWrapper>
      </Router>
    </AuthProvider>
  );
}

export default App;
