# Taxfolio - Frontend

This is the React-based frontend for the Taxfolio application. It provides the user interface for interacting with the Taxfolio backend, allowing users to upload documents, view their portfolio, and generate tax-related information.

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Table of Contents

- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [Environment Variables](#environment-variables)
- [Running the Frontend](#running-the-frontend)
- [Project Structure](#project-structure)
- [Backend Dependency](#backend-dependency)
- [Original Create React App Information](#original-create-react-app-information)
  - [Available Scripts](#available-scripts)
  - [Learn More](#learn-more)

## Prerequisites

- [Node.js](https://nodejs.org/) (which includes npm) - Version 16.x or higher recommended.
- The Taxfolio backend server must be running.

## Setup

1.  **Clone the repository (if not already done):**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-url>/frontend
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    # or
    # yarn install
    ```

## Running the Frontend

1.  **Ensure the Backend is Running:** The backend API (default: `http://localhost:8080`) must be running.
2.  **Start the frontend development server:**
    ```bash
    npm start
    # or
    # yarn start
    ```
    This runs the app in development mode. Open [http://localhost:3000](http://localhost:3000) to view it in your browser. The page will reload when you make changes.

    **Note:** The `start` script in `package.json` (`set NODE_OPTIONS=--openssl-legacy-provider && react-scripts start`) includes `NODE_OPTIONS=--openssl-legacy-provider`. This is a workaround for potential SSL provider issues with newer Node.js versions and Webpack.

## Project Structure

The `src` folder contains the main application code:

-   `components/`: Reusable UI components.
    -   `dashboardSections/`: Specific components used within the Dashboard page.
-   `context/`: React Context API for global state management (e.g., `AuthContext.js` for authentication).
-   `layouts/`: Components that define the overall structure of the application (e.g., `Layout.js` which includes the sidebar and app bar).
-   `pages/`: Top-level components that correspond to different routes/views of the application (e.g., `UploadPage.js`, `DashboardPage.js`).
-   `App.js`: The main application component where routing is set up.
-   `index.js`: The entry point of the React application.

## Backend Dependency

This frontend application relies heavily on the Taxfolio backend API. Ensure the backend server is running and accessible (typically at `http://localhost:8080`) for the frontend to function correctly (e.g., user authentication, data uploads, fetching portfolio details).
