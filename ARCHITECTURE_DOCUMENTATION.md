# VisorFinanceiro Architecture Documentation

## Overview

VisorFinanceiro is a portfolio management and tax reporting application built with a Go backend and React frontend. The application allows users to upload transaction data from various brokers (DEGIRO, Interactive Brokers) and provides comprehensive portfolio analytics, tax calculations, and performance tracking.

## System Architecture

### Backend Architecture

The backend is built using Go with the following key components:

#### Core Services
- **Price Service** (`backend/src/services/price_service.go`) - Handles stock price fetching and caching
- **Upload Service** (`backend/src/services/upload_service.go`) - Manages file uploads and transaction processing
- **Email Service** (`backend/src/services/email_service.go`) - Handles email notifications
- **MFA Service** (`backend/src/services/mfa_service.go`) - Manages two-factor authentication

#### Data Processing Pipeline
1. **File Upload** - Users upload CSV files containing transaction data
2. **Parser Factory** - Routes files to appropriate parsers based on broker type
3. **Transaction Processing** - Processes transactions through specialized processors:
   - Stock Sales Processor
   - Option Sales Processor  
   - Dividend Processor
   - Fee Processor
   - Exchange Rate Processor
   - Commission Processor
   - Cash Movement Processor

#### Database Schema

The application uses SQLite with the following key tables:

```sql
-- Core Tables
users                    - User accounts and authentication
portfolios              - User portfolio management (multi-portfolio support)
processed_transactions  - Transaction history with portfolio association
portfolio_snapshots     - Daily portfolio valuations
isin_ticker_map         - ISIN to ticker symbol mappings
daily_prices           - Cached stock prices

-- Supporting Tables  
sessions               - Authentication sessions
login_history          - User login tracking
uploads_history        - File upload tracking
upload_failures        - Failed upload tracking
system_metrics         - Application metrics
```

### Frontend Architecture

The frontend is built with React 18 using Vite as the build tool, Material-UI (MUI) for UI components, and React Router v6 for navigation. The application follows a feature-based architecture with comprehensive state management and data fetching patterns.

#### Tech Stack
- **Framework**: React 18.3.1 with functional components and hooks
- **Build Tool**: Vite 5.4.21 for fast development and optimized builds
- **UI Library**: Material-UI v5 with custom theming
- **State Management**: React Context API with custom hooks
- **Data Fetching**: TanStack Query (React Query) v5 for server state management
- **Routing**: React Router DOM v6 with protected routes
- **Charts**: Chart.js v4 with specialized adapters for financial data
- **Form Handling**: Native HTML forms with validation
- **Styling**: CSS-in-JS with MUI styling system

#### Key Features
- **Multi-Portfolio Support** - Users can manage multiple portfolios with seamless switching
- **Analytics Dashboard** - Comprehensive portfolio performance metrics with interactive charts
- **Tax Reporting** - Automated tax calculation and reporting with detailed breakdowns
- **File Upload Interface** - Streamlined CSV upload process with drag-and-drop support
- **Admin Dashboard** - System administration and user management with detailed metrics
- **Live-updating Dashboard (polling)** - Data is refreshed every 60 seconds via TanStack Query polling for portfolio updates and performance tracking
- **Responsive Design** - Mobile-first responsive design for all devices

#### Architecture Patterns

##### 1. Feature-Based Organization
The application follows a feature-based architecture where each major functionality is self-contained:

```
frontend/src/
├── features/           - Feature-based component organization
│   ├── admin/         - Administrative functionality
│   │   ├── api/       - Admin-specific API calls
│   │   ├── components/ - Admin UI components
│   │   ├── config/    - Admin configuration and constants
│   │   ├── hooks/     - Admin-specific hooks
│   │   └── pages/     - Admin pages
│   ├── analytics/     - Portfolio analytics
│   │   ├── api/       - Analytics API integration
│   │   ├── components/ - Chart and data visualization components
│   │   ├── config/    - Chart configurations
│   │   ├── hooks/     - Data fetching and processing hooks
│   │   ├── logic/     - Business logic for analytics
│   │   └── pages/     - Analytics pages
│   ├── auth/          - Authentication components
│   │   ├── api/       - Authentication API calls
│   │   ├── components/ - Auth modals and guards
│   │   └── pages/     - Auth pages (login, register, etc.)
│   ├── dashboard/     - Main dashboard
│   │   ├── components/ - Dashboard widgets and charts
│   │   ├── hooks/     - Dashboard data fetching
│   │   └── pages/     - Dashboard page
│   ├── portfolio/     - Portfolio management
│   │   ├── api/       - Portfolio API integration
│   │   ├── components/ - Portfolio UI components
│   │   ├── hooks/     - Portfolio data management
│   │   └── pages/     - Portfolio pages
│   ├── upload/        - File upload functionality
│   │   ├── components/ - Upload interface components
│   │   └── pages/     - Upload and guide pages
│   └── tax/           - Tax reporting
│       ├── logic/     - Tax calculation logic
│       └── pages/     - Tax reporting pages
├── components/        - Shared UI components
│   └── ui/           - Reusable UI components
├── layouts/          - Page layouts and wrappers
├── lib/              - Utility functions and API clients
│   ├── api.js        - Centralized API client
│   ├── theme.js      - MUI theme configuration
│   └── utils/        - Utility functions
└── hooks/            - Custom React hooks (if any)
```

##### 2. State Management Architecture
The application uses a hybrid state management approach:

- **Global State**: React Context API for authentication and portfolio selection
- **Server State**: TanStack Query for API data fetching, caching, and synchronization
- **Local State**: useState and useReducer for component-specific state

**Context Providers**:
- `AuthProvider`: Manages authentication state, tokens, and user information
- `PortfolioProvider`: Manages selected portfolio and portfolio switching

##### 3. Data Flow Pattern
```
1. User Action → Component Event Handler
2. API Call → TanStack Query mutation/query
3. Server Response → Query Cache Update
4. Component Re-render → UI Update
5. Optimistic Updates → Immediate UI feedback
```

##### 4. API Integration
Centralized API client (`frontend/src/lib/api.js`) provides:
- Automatic JWT token attachment
- CSRF token handling
- Error handling and retry logic
- Request/response interceptors
- Consistent API endpoint management

#### Component Architecture

##### 1. Layout System
- **Layout Component**: Main layout wrapper with navigation, headers, and footers
- **Route Guards**: Protected routes with authentication and authorization checks
- **Admin Layout**: Specialized layout for administrative functions

##### 2. Page Components
Each feature has dedicated page components that:
- Handle URL parameters and navigation
- Coordinate data fetching from multiple sources
- Manage page-level state and interactions
- Render feature-specific components

##### 3. Feature Components
- **Data Components**: Handle data fetching and processing
- **Display Components**: Present data in charts, tables, and visualizations
- **Interactive Components**: Handle user input and actions

##### 4. Shared Components
- **UI Components**: Reusable buttons, modals, forms, and inputs
- **Chart Components**: Specialized financial chart components using Chart.js
- **Data Grids**: Material-UI DataGrid for tabular data display

#### Key Technical Features

##### 1. Authentication Flow
- JWT-based authentication with automatic token refresh
- **JWT Storage**: JWTs are stored in HttpOnly, Secure, SameSite=Lax cookies, with CSRF tokens required for all POST/PUT/DELETE operations
- CSRF protection for all state-changing operations
- Protected routes with role-based access control
- OAuth integration with Google for social login

##### 2. Data Visualization
- **Chart.js Integration**: Custom financial charts with date adapters
- **Heatmap Charts**: Portfolio allocation visualization
- **TreeMap Charts**: Asset distribution visualization
- **Interactive Charts**: Zoom, pan, and drill-down capabilities

##### 3. File Upload System
- Drag-and-drop interface for CSV file uploads
- Real-time upload progress tracking
- File validation and error handling
- Support for multiple broker formats (DEGIRO, Interactive Brokers)

##### 4. Performance Optimization
- **Code Splitting**: Route-based code splitting for faster initial loads
- **Lazy Loading**: Component-level lazy loading for heavy features
- **Query Caching**: Intelligent caching with cache invalidation
- **Virtualization**: DataGrid virtualization for large datasets

##### 5. Error Handling
- Global error boundaries for React errors
- API error handling with user-friendly messages
- Network error retry mechanisms
- Graceful degradation for failed operations

#### Development Workflow

##### 1. Environment Setup
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run serve
```

##### 2. Code Organization
- Feature-based development with isolated components
- Consistent naming conventions (PascalCase for components, camelCase for functions)
- TypeScript-ready structure (though currently using JavaScript)
- Comprehensive error boundaries and loading states

##### 3. Testing Strategy
- Jest for unit testing
- React Testing Library for component testing
- Integration testing for API interactions
- End-to-end testing for critical user flows

#### Integration with Backend

##### 1. API Communication
- RESTful API integration with the Go backend
- Automatic JWT token management
- CSRF token synchronization
- Real-time data updates through polling

##### 2. Data Synchronization
- Optimistic updates for better UX
- Background data synchronization
- Cache invalidation on data changes
- Conflict resolution for concurrent updates

##### 3. Security Integration
- Automatic token refresh on expiration
- CSRF protection for all state-changing operations
- Secure cookie handling for authentication
- Input validation and sanitization

## Key Technical Features

### Multi-Portfolio Architecture

The system supports multiple portfolios per user with proper data isolation:

- Each transaction is associated with a specific portfolio
- Portfolio snapshots track daily valuations per portfolio
- Analytics and reporting are portfolio-specific
- Foreign key relationships ensure data integrity

### Transaction Processing

The system handles various transaction types:

1. **Stock Transactions** - Buy/sell operations with FIFO cost basis calculation
2. **Option Transactions** - Complex option strategies with position tracking
3. **Dividends** - Automatic dividend processing and tax reporting
4. **Fees and Commissions** - Transaction cost tracking
5. **Cash Movements** - Deposits and withdrawals

### Price Caching System

- **ECB Exchange Rates** - Automatic EUR conversion using European Central Bank rates
- **Stock Price Caching** - Local caching of stock prices to reduce API calls
- **ISIN Resolution** - Automatic mapping of ISIN codes to stock tickers via Yahoo Finance API with local database caching

### Database Optimization

To handle concurrent web requests efficiently with SQLite, the database is initialized with optimized settings:

```sql
PRAGMA journal_mode=WAL;      -- Write-Ahead Logging for concurrent reads/writes
PRAGMA synchronous=NORMAL;    -- Balanced performance and durability
PRAGMA cache_size=10000;      -- 10MB cache for improved performance
PRAGMA temp_store=memory;     -- Store temporary tables in memory
```

**Concurrency Management**: The Go backend utilizes an internal connection pool with a configurable "Busy Timeout" (default: 5 seconds) to manage SQLite's file-locking during concurrent writes. The backend is designed as a singleton service to maintain a single writer connection to the SQLite database, preventing database corruption and "Database is Locked" errors that would occur with horizontal scaling.

**Backup Strategy**: Since the database is a single file, automated backups can be performed using SQLite's `VACUUM INTO` command to create consistent backups without downtime:

```bash
# Example backup script
sqlite3 /app/db/visorfinanceiro.db "VACUUM INTO '/backup/visorfinanceiro_$(date +%Y%m%d_%H%M%S).db'"
```

### Security Features

- **JWT Authentication** - Secure token-based authentication
- **CSRF Protection** - Cross-site request forgery protection
- **MFA Support** - Two-factor authentication using TOTP
- **Password Reset** - Secure password reset with email verification
- **Email Verification** - Account verification via email

## Configuration

### Environment Variables

The application uses environment-based configuration:

```bash
# Database
DATABASE_PATH=./visorfinanceiro.db

# Security
JWT_SECRET=your-secret-key
CSRF_AUTH_KEY=your-csrf-key

# Email
EMAIL_SERVICE_PROVIDER=smtp
SENDER_EMAIL=noreply@example.com
SMTP_SERVER=smtp.example.com
SMTP_PORT=587

# OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# File Upload
MAX_UPLOAD_SIZE_BYTES=10485760  # 10MB

# Database Configuration
SQLITE_BUSY_TIMEOUT=5000  # Busy timeout in milliseconds (default: 5000)
```

### Database Migrations

The system uses golang-migrate for database schema management:

```bash
# Run migrations
go run github.com/golang-migrate/migrate/v4/cmd/migrate -path db/migrations -database sqlite://visorfinanceiro.db up
```

## Development Setup

### Backend Requirements
- Go 1.22+
- SQLite3
- Node.js (for frontend)

### Frontend Requirements
- Node.js 18+
- npm or yarn

### Running the Application

1. **Backend Setup**:
   ```bash
   cd backend
   go mod download
   go run main.go
   ```

2. **Frontend Setup**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Database Initialization**:
   - The application automatically creates and migrates the database on startup
   - Initial schema includes all necessary tables and relationships

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `POST /api/auth/refresh` - Token refresh
- `POST /api/auth/verify-email` - Email verification
- `POST /api/auth/reset-password` - Password reset

### Portfolio Management
- `GET /api/portfolios` - List user portfolios
- `POST /api/portfolios` - Create new portfolio
- `PUT /api/portfolios/{id}` - Update portfolio
- `DELETE /api/portfolios/{id}` - Delete portfolio

### Transaction Processing
- `POST /api/upload` - Upload transaction files
- `GET /api/transactions` - Get transaction history
- `GET /api/holdings` - Get current holdings
- `GET /api/snapshots` - Get portfolio snapshots

### Analytics and Reporting
- `GET /api/analytics/overview` - Portfolio overview
- `GET /api/analytics/holdings` - Holdings analysis
- `GET /api/analytics/sales` - Sales performance
- `GET /api/tax` - Tax calculations

## Error Handling

The application implements comprehensive error handling:

- **Validation Errors** - Input validation with detailed error messages
- **Business Logic Errors** - Domain-specific error handling
- **Database Errors** - Proper transaction handling and rollback
- **API Errors** - Standardized error responses with appropriate HTTP status codes

## Logging

The application uses structured logging with the following levels:

- **Debug** - Detailed debugging information
- **Info** - General application flow information
- **Warn** - Warning messages that don't stop execution
- **Error** - Error conditions that prevent normal operation

## Testing

### Backend Testing
- Unit tests for individual components
- Integration tests for API endpoints
- Database migration testing

### Frontend Testing
- Component testing with Jest
- Integration testing for user flows
- End-to-end testing for critical paths

## Deployment Architecture

### Container Architecture

The application uses a multi-container Docker architecture with the following services:

#### 1. Backend Service
- **Base Image**: Custom Go build with SQLite support
- **Environment Variables**: Configured via `.env` file
- **Volume Mounts**: Persistent database storage via named volumes
- **Health Checks**: Built-in health check endpoints
- **Restart Policy**: `unless-stopped` for production reliability
- **Concurrency**: Singleton service to maintain single writer connection to SQLite database

#### 2. Caddy Reverse Proxy
- **Purpose**: Serves frontend static files and acts as reverse proxy
- **SSL/TLS**: Automatic HTTPS certificate management via Let's Encrypt
- **Build Process**: Multi-stage build with React production build
- **Environment Variables**: API base URL passed during build time
- **Port Mapping**: 80 (HTTP) and 443 (HTTPS) to host

#### 3. Volume Management
```yaml
volumes:
  visorfinanceiro_data:    # Backend database persistence
  caddy_data:             # SSL certificates and state
```

### Docker Compose Configuration

The `docker-compose.yml` defines a production-ready setup:

```yaml
services:
  backend:
    build: ./backend
    container_name: visorfinanceiro-backend-container
    restart: unless-stopped
    env_file: .env
    volumes:
      - visorfinanceiro_data:/app/db

  caddy:
    build:
      context: .
      dockerfile: caddy/Dockerfile
      args:
        - REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL}
    container_name: visorfinanceiro-caddy-container
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - caddy_data:/data
    depends_on:
      - backend

volumes:
  visorfinanceiro_data:
  caddy_data:
```

### Production Deployment

#### Environment Configuration
Create a `.env` file in the project root with production values:

```bash
# Database Configuration
DATABASE_PATH=/app/db/visorfinanceiro.db

# Security Configuration
JWT_SECRET=your-production-jwt-secret-key-here
CSRF_AUTH_KEY=your-production-csrf-auth-key-here

# Email Configuration (Production SMTP)
EMAIL_SERVICE_PROVIDER=smtp
SENDER_EMAIL=noreply@yourdomain.com
SMTP_SERVER=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USERNAME=your-smtp-username
SMTP_PASSWORD=your-smtp-password

# OAuth Configuration (Production)
GOOGLE_CLIENT_ID=your-production-google-client-id
GOOGLE_CLIENT_SECRET=your-production-google-client-secret

# Frontend Configuration
REACT_APP_API_BASE_URL=https://yourdomain.com/api

# File Upload Configuration
MAX_UPLOAD_SIZE_BYTES=10485760  # 10MB
```

#### Deployment Steps

1. **Build and Start Services**:
   ```bash
   # Build all services
   docker-compose build
   
   # Start services in detached mode
   docker-compose up -d
   ```

2. **Verify Deployment**:
   ```bash
   # Check service status
   docker-compose ps
   
   # View logs
   docker-compose logs -f
   ```

3. **Health Checks**:
   - Backend: `GET /` should return JSON response
   - Frontend: Access via configured domain
   - Database: Verify volume mounting and persistence

#### Production Considerations

##### 1. Security Hardening
- **HTTPS Only**: Caddy automatically redirects HTTP to HTTPS
- **Security Headers**: Caddy adds security headers automatically
- **Secrets Management**: Use Docker secrets or external secret management
- **Network Isolation**: Services communicate via internal Docker network

##### 2. Performance Optimization
- **Resource Limits**: Set memory and CPU limits in docker-compose
- **Caching**: Leverage Caddy's built-in caching for static assets
- **Database Optimization**: SQLite performance tuning for production load
- **CDN Integration**: Consider CDN for static assets in high-traffic scenarios

##### 3. Monitoring and Observability
- **Container Monitoring**: Use Docker stats or external monitoring tools
- **Application Logs**: Centralized logging with structured format
- **Health Checks**: Implement application-level health checks
- **Performance Metrics**: Monitor response times and error rates

##### 4. Backup and Recovery
- **Database Backups**: Regular backups of the SQLite database volume
- **Configuration Backups**: Version control for docker-compose and configuration
- **Disaster Recovery**: Documented procedures for service restoration

##### 5. Scaling Considerations
- **Vertical Scaling**: Scale the single backend instance by increasing CPU, memory, and storage resources
- **Database Scaling**: Evaluate PostgreSQL migration for high-scale scenarios
- **Caching Layer**: Redis for session storage and application caching
- **CDN Integration**: Global content delivery for static assets

### Development vs Production Differences

| Aspect | Development | Production |
|--------|-------------|------------|
| Database | Local SQLite file | Persistent volume |
| SSL/TLS | Self-signed certificates | Let's Encrypt certificates |
| Logging | Console output | Structured logging to files |
| Error Handling | Detailed error messages | User-friendly messages |
| Performance | Hot reload enabled | Optimized builds |
| Security | Relaxed CORS | Strict security headers |
| Monitoring | Basic logging | Comprehensive monitoring |

### CI/CD Integration

For automated deployments, consider the following pipeline stages:

1. **Build Stage**:
   - Frontend build optimization
   - Backend compilation and testing
   - Docker image building

2. **Test Stage**:
   - Unit tests for both frontend and backend
   - Integration tests with database
   - Security scanning of Docker images

3. **Deploy Stage**:
   - Image pushing to registry
   - Service deployment with zero downtime
   - Health check verification

4. **Post-Deploy Stage**:
   - Smoke tests
   - Performance validation
   - Monitoring setup verification

### Troubleshooting Production Issues

#### Common Production Issues

1. **Container Startup Failures**:
   ```bash
   # Check container logs
   docker-compose logs backend
   docker-compose logs caddy
   
   # Verify environment variables
   docker-compose.exec backend env | grep -E "(JWT|CSRF|DATABASE)"
   ```

2. **Database Connection Issues**:
   ```bash
   # Check volume mounting
   docker-compose exec backend ls -la /app/db/
   
   # Verify database file permissions
   docker-compose exec backend stat /app/db/visorfinanceiro.db
   ```

3. **SSL Certificate Issues**:
   ```bash
   # Check Caddy logs for certificate errors
   docker-compose logs caddy | grep -i certificate
   
   # Verify domain configuration
   docker-compose exec caddy cat /etc/caddy/Caddyfile
   ```

4. **Performance Issues**:
   ```bash
   # Monitor resource usage
   docker stats
   
   # Check application logs for slow queries
   docker-compose logs backend | grep -i "slow\|timeout"
   ```

#### Docker Volume Permissions

**UID/GID Mapping**: When the backend container restarts, ensure the SQLite database file has proper permissions. Docker volumes often mount as root, but the Go app might run as a non-root user. To prevent "Permission Denied" errors when the Go app tries to write to the .db file, configure user mapping in docker-compose.yml:

```yaml
services:
  backend:
    user: "${UID:-1000}:${GID:-1000}"  # Map to host user/group IDs
    # ... other configuration
```

Set UID and GID environment variables in your `.env` file to match your host user's IDs.

This comprehensive deployment architecture ensures reliable, secure, and scalable production deployments while maintaining development flexibility.

## Future Enhancements

### Planned Features
- **Websocket Integration** - Live price updates and portfolio valuation via websockets
- **Advanced Analytics** - More sophisticated performance metrics and benchmarks
- **Mobile Application** - Native mobile apps for iOS and Android
- **Multi-currency Support** - Enhanced support for international portfolios
- **API Rate Limiting** - Protection against API abuse
- **Audit Logging** - Comprehensive audit trails for compliance

### Technical Improvements
- **Caching Layer** - Redis-based caching for improved performance
- **Background Jobs** - Asynchronous processing for long-running tasks
- **Microservices Architecture** - Service decomposition for scalability
- **Database Optimization** - Query optimization and indexing strategies

## Troubleshooting

### Common Issues

1. **Database Lock Errors**
   - Ensure only one process accesses the SQLite database
   - Check for proper connection handling

2. **File Upload Failures**
   - Verify file size limits and format requirements
   - Check file permissions and storage space

3. **Authentication Issues**
   - Verify JWT secret configuration
   - Check CSRF token handling
   - Ensure proper session management

4. **Price Fetching Failures**
   - Check internet connectivity
   - Verify API rate limits
   - Review caching configuration

### Debug Mode
Enable debug logging by setting `LOG_LEVEL=debug` in the environment configuration.

## Contributing

### Code Style
- Follow Go and React best practices
- Use consistent naming conventions
- Write comprehensive tests for new features
- Document significant changes

### Pull Request Process
1. Create feature branch from main
2. Implement changes with tests
3. Update documentation as needed
4. Submit pull request with detailed description
5. Address review feedback
6. Merge after approval

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contact

For questions or support, please contact the development team or create an issue in the project repository.