# Stage 1

## Core Actions
The notification platform should support the following core actions:
1. Fetch all notifications (with support for filtering unread ones).
2. Mark a specific notification as read.
3. Establish a persistent connection for real-time live updates.

## REST API Endpoints & Contracts

### 1. Fetch User Notifications
**Endpoint:** `GET /api/v1/notifications`
**Description:** Retrieves a list of notifications for the authenticated student.
**Headers:**
`{"Authorization": "Bearer <jwt_token>"}`
**Query Parameters:** `?status=unread&limit=20`

**Response (200 OK):**
`{ "success": true, "data": [ { "id": "b283218f-ea5a-4b7c-93a9-1f2f240d64b0", "type": "Placement", "message": "CSX Corporation hiring", "isRead": false, "timestamp": "2026-04-22T17:51:18Z" } ] }`

### 2. Mark Notification as Read
**Endpoint:** `PATCH /api/v1/notifications/:id/read`
**Description:** Updates the status of a specific notification to 'read'.
**Headers:**
`{ "Authorization": "Bearer <jwt_token>", "Content-Type": "application/json" }`

**Response (200 OK):**
`{ "success": true, "message": "Notification marked as read successfully." }`

## Real-time Notification Mechanism
To provide real-time updates to students regarding Placements, Events, and Results, the optimal choice is **WebSockets**. 
* **Connection:** When a student logs in, the client establishes a persistent WebSocket connection to the server.
* **Authentication:** The initial WebSocket handshake will include the JWT token for student identification and security.
* **Mechanism:** When a new event occurs (e.g., HR publishes a placement update), the backend persists the notification to the database and immediately broadcasts a `new_notification` JSON payload over the active WebSocket channel to the targeted students. 


---

# Stage 2

## Persistent Storage Choice
I suggest **MongoDB** (NoSQL) for the notification system. 
**Reasoning:**
1. **High Write Throughput:** Notifications are highly write-intensive. MongoDB handles rapid, high-volume inserts efficiently.
2. **Flexible Schema:** Different notification types (Placement, Event, Result) might require slightly different metadata in the future. MongoDB's document model allows easy schema evolution.
3. **JSON Native:** Since our backend is in Node.js/Express, MongoDB's BSON/JSON format integrates seamlessly without complex ORM mappings.

## Database Schema
Below is the proposed MongoDB schema for the `Notification` collection:
`{ "_id": "ObjectId", "studentId": { "type": "String", "required": true, "index": true }, "type": { "type": "String", "enum": ["Placement", "Event", "Result"], "required": true }, "message": { "type": "String", "required": true }, "isRead": { "type": "Boolean", "default": false }, "createdAt": { "type": "Date", "default": "Date.now", "index": -1 } }`

## Scalability Problems and Solutions
**Problems as data volume increases:**
1. **Slow Queries:** Querying millions of records to find a specific student's unread notifications will become extremely slow.
2. **Storage Bloat:** Accumulating historical notifications forever will consume massive disk space and degrade database performance.

**Solutions:**
1. **Compound Indexing:** Create a compound index on `{ studentId: 1, isRead: 1, createdAt: -1 }`. This ensures fetching unread notifications is lightning fast.
2. **TTL (Time-To-Live) Indexes:** Implement a TTL index on `createdAt` to automatically delete/archive notifications older than 6 months.
3. **Caching Layer:** Use Redis to cache the "unread count" for active students.

## NoSQL Queries
Based on the REST APIs designed in Stage 1, here are the applicable MongoDB queries:

**1. Fetch User's Unread Notifications (API 1):**
`db.notifications.find({ studentId: "1042", isRead: false }).sort({ createdAt: -1 }).limit(20);`

**2. Mark Notification as Read (API 2):**
`db.notifications.updateOne({ _id: ObjectId("b283218f-ea5a-4b7c-93a9-1f2f240d64b0") }, { $set: { isRead: true } });`



---

# Stage 3

## Query Analysis
**Original Query:** `SELECT * FROM notifications WHERE studentID = 1042 AND isRead = false ORDER BY createdAt DESC;`

1. **Is this query accurate?**
   Logically, yes. It correctly filters by student, checks for unread status, and sorts by the newest first.
2. **Why is it slow?**
   - **Full Table Scan:** With 5,000,000 rows, lacking a proper index means the DB engine might be scanning every row.
   - **Using `SELECT *`:** Fetching all columns increases network payload and memory consumption unnecessarily.
   - **Expensive Sort:** Sorting 5 million rows on `createdAt` without an index triggers a massive, slow in-memory "filesort".

## Proposed Changes and Computation Cost
**Changes:**
1. Avoid `SELECT *`. Explicitly select only required columns (e.g., `SELECT id, message, timestamp`).
2. Implement a **Composite Index** on `(studentID, isRead, createdAt)`.
**Computation Cost:**
Without indexes, the cost is **O(N)** (where N is 5,000,000). With the B-Tree composite index, the database can instantly seek the exact rows and return them pre-sorted, reducing the time complexity to **O(log N)**, making it virtually instantaneous.

## Advice on Indexing Every Column
The advice to "add indexes on every column to be safe" is **highly ineffective and dangerous**. 
- **Storage Overhead:** Indexes duplicate data in B-Tree structures, massively bloating the database size.
- **Write Degradation:** Every `INSERT`, `UPDATE`, or `DELETE` operation requires updating all those indexes, which will cripple the system's write performance. Notifications are write-heavy, making this a terrible approach.

## Query for Placement Notifications in the Last 7 Days
```sql
SELECT DISTINCT studentID 
FROM notifications 
WHERE notificationType = 'Placement' 
AND createdAt >= NOW() - INTERVAL 7 DAY;



---

# Stage 4

## Performance Improvement Strategy
Fetching notifications from the database on every single page load is an anti-pattern for high-traffic applications. To resolve the DB overwhelming issue and improve performance, I suggest implementing a **Caching Layer using Redis**.

### Proposed Solution: Redis Caching
1. **Cache Structure:** Use a Redis Hash or List for each user. For example, a key like `user:1042:notifications:unread`.
2. **Read Path (Page Load):** - When a student loads the page, the backend first checks Redis. 
   - If the data is present (Cache Hit), return it instantly. 
   - If not (Cache Miss), fetch from MongoDB, store a copy in Redis with a TTL (e.g., 10 minutes), and then return the data.
3. **Write Path (New Notification):** - When HR sends a new notification, save it to MongoDB and *also* push it directly to the student's Redis cache.
4. **Invalidation:** - When a student marks a notification as "read", update MongoDB and immediately remove that specific notification ID from their Redis cache.

### Tradeoffs of Caching Strategy
**Pros:**
* **Drastically Reduced DB Load:** MongoDB is shielded from repetitive, expensive read queries.
* **Extremely Low Latency:** Redis reads from RAM, providing sub-millisecond response times, resulting in a much snappier user experience.
* **Cost Effective:** Cheaper to scale a Redis cluster for reads than vertically scaling a MongoDB instance.

**Cons / Tradeoffs:**
* **Stale Data (Eventual Consistency):** If the cache invalidation fails or gets delayed, a student might see a "ghost" unread notification that they already clicked, or miss a new one until the TTL expires.
* **Memory Constraints:** Redis stores data in RAM, which is expensive. We cannot cache the entire notification history; we must strictly limit the cache to recent/unread notifications only.
* **System Complexity:** Introduces a new infrastructure component. The backend must now handle cache connection errors, cache stampedes (thundering herd problem), and serialization logic.



---

# Stage 5

## Shortcomings of the Current Implementation
The provided pseudocode is a classic synchronous loop processing a massive batch (50,000 students). Its core flaws are:
1. **Synchronous & Blocking:** It processes users one by one sequentially. If `send_email` takes 1 second, the loop will take ~14 hours to finish.
2. **Lack of Fault Tolerance:** If an API call fails or times out halfway (as seen in the logs), the process crashes, leaving remaining students unnotified with no easy way to retry.
3. **Coupling:** Sending emails (slow, external I/O) is tightly coupled with saving to DB and pushing to the app (fast, internal I/O).

## Redesigning for Reliability and Speed
To make this fast and reliable, we need an **Asynchronous Message Queue** (like RabbitMQ, Kafka, or AWS SQS) and a **Worker Pool**.

**Should DB save and Email happen together?**
**No.** Saving to the DB (for the in-app notification) is a critical path and should happen immediately so the state is consistent. Sending an email is a secondary, external side-effect. They have vastly different latency profiles and failure rates, so they should be decoupled.

## Revised Pseudocode

```python
# 1. Main API Handler (Fast Response)
function notify_all(student_ids: array, message: string):
    # Bulk insert to DB for extreme speed
    bulk_save_to_db(student_ids, message)
    
    # Dispatch lightweight events to a Message Queue
    for student_id in student_ids:
        push_to_app_async(student_id, message) # Handled by WebSocket server
        enqueue_email_task(student_id, message) # Pushed to MQ (e.g., RabbitMQ)
        
    return "Notifications queued successfully"

# 2. Independent Email Worker Process (Running in background)
function email_worker_process(task_queue):
    while true:
        task = task_queue.consume()
        try:
            send_email(task.student_id, task.message)
            task.mark_completed()
        except APIError:
            # Automatic retry mechanism via MQ
            task.retry(delay=5_minutes, max_retries=3)
            log_error("Email failed, retrying...")