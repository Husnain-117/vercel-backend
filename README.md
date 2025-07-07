## Setting a Fixed Backend Port

To ensure your backend always runs on the same port (e.g., 5000):

1. Create a `.env` file in the `server/` directory (you can copy from `.env.example`):

   ```sh
   cp .env.example .env
   ```

2. Edit `.env` and set:

   ```sh
   PORT=5000
   ```

3. Restart the backend server after changing `.env`.

This will ensure the backend always runs on port 5000, so you don't have to update the frontend API URL every time. 