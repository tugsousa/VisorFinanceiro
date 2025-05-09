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

3.  **Environment Variables:**
    While most API calls are made to `http://localhost:8080` directly in the code, for a more flexible setup, you can create a `.env` file in the `frontend` directory:
    ```env
    REACT_APP_API_BASE_URL=http://localhost:8080
    ```
    If you implement this, you would then use `process.env.REACT_APP_API_BASE_URL` in your API calls.
    Currently, the `package.json` includes a `proxy` field: `"proxy": "http://localhost:8080"`. This proxy is primarily effective for `fetch` or `axios` calls made to relative paths (e.g., `/api/auth/login`). Since the current Axios calls use absolute URLs (e.g., `http://localhost:8080/api/auth/login`), this proxy setting is not actively used by them but is good to be aware of.

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

## Original Create React App Information

### Available Scripts

In the project directory, you can run:

#### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

#### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

#### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

#### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

### Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).