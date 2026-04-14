import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

import { buildApiUrl, getFetchErrorMessage } from '../services/apiBase';

interface AuthContextType {
  isAuthenticated: boolean;
  loginWithCredentials: (email: string, password?: string) => Promise<{ success: boolean; message?: string }>;
  verifyLoginLink: (token: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const readStoredAuth = () => {
  const savedAuth = localStorage.getItem('leakradar_auth');
  return savedAuth ? JSON.parse(savedAuth) : false;
};

const parseJsonSafely = async (response: Response) => {
  const responseText = await response.text();

  if (!responseText.trim()) {
    return {};
  }

  try {
    return JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    throw new Error('Login API did not return valid JSON.');
  }
};

const getErrorMessage = (payload: Record<string, unknown>, fallback: string) => {
  return typeof payload.message === 'string' && payload.message.trim() ? payload.message : fallback;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(readStoredAuth);

  const loginWithCredentials = async (
    email: string,
    password?: string,
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await parseJsonSafely(response);

      if (!response.ok) {
        return {
          success: false,
          message: getErrorMessage(data, '登录失败，请检查账号或密码。'),
        };
      }

      setIsAuthenticated(true);
      localStorage.setItem('leakradar_auth', 'true');

      if (data.user) {
        localStorage.setItem('leakradar_user', JSON.stringify(data.user));
      }

      return {
        success: true,
        message: getErrorMessage(data, '登录成功。'),
      };
    } catch (error) {
      return {
        success: false,
        message: getFetchErrorMessage(error, '登录请求发送失败，请检查后端服务与前端环境变量配置。'),
      };
    }
  };

  const verifyLoginLink = async (token: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await fetch(buildApiUrl(`/api/auth/login?token=${encodeURIComponent(token)}`), {
        method: 'GET',
      });

      const data = await parseJsonSafely(response);

      if (!response.ok) {
        return {
          success: false,
          message: getErrorMessage(data, '登录验证失败，请重新获取登录链接。'),
        };
      }

      setIsAuthenticated(true);
      localStorage.setItem('leakradar_auth', 'true');

      if (data.user) {
        localStorage.setItem('leakradar_user', JSON.stringify(data.user));
      }

      return {
        success: true,
        message: getErrorMessage(data, '登录验证成功。'),
      };
    } catch (error) {
      return {
        success: false,
        message: getFetchErrorMessage(error, '登录验证请求发送失败，请检查后端服务与前端环境变量配置。'),
      };
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('leakradar_auth');
    localStorage.removeItem('leakradar_user');
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, loginWithCredentials, verifyLoginLink, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
