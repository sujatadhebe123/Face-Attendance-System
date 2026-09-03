from database.db import engine

try:
    connection = engine.connect()
    print("PostgreSQL connected successfully!")
    connection.close()
except Exception as e:
    print("Connection failed!")
    print(e)