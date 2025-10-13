-- init-scripts/01-create-database.sql
-- Create test database for MCP Server

USE master;
GO

-- Drop database if exists
IF EXISTS (SELECT name FROM sys.databases WHERE name = 'MCPTestDB')
BEGIN
    ALTER DATABASE MCPTestDB SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE MCPTestDB;
END
GO

-- Create database
CREATE DATABASE MCPTestDB;
GO

USE MCPTestDB;
GO

SET QUOTED_IDENTIFIER ON;
GO

-- Create additional schemas
CREATE SCHEMA analytics;
GO

CREATE SCHEMA reports;
GO

-- ============================================
-- TABLES
-- ============================================

-- Customers table
CREATE TABLE dbo.Customers (
    CustomerId INT IDENTITY(1,1) PRIMARY KEY,
    FirstName NVARCHAR(50) NOT NULL,
    LastName NVARCHAR(50) NOT NULL,
    Email NVARCHAR(100) UNIQUE NOT NULL,
    Phone NVARCHAR(20),
    Status NVARCHAR(20) DEFAULT 'Active',
    CreatedDate DATETIME2 DEFAULT GETUTCDATE(),
    ModifiedDate DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- Products table
CREATE TABLE dbo.Products (
    ProductId INT IDENTITY(1,1) PRIMARY KEY,
    ProductName NVARCHAR(100) NOT NULL,
    Category NVARCHAR(50) NOT NULL,
    Price DECIMAL(10,2) NOT NULL,
    StockQuantity INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    CreatedDate DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- Orders table
CREATE TABLE dbo.Orders (
    OrderId INT IDENTITY(1,1) PRIMARY KEY,
    CustomerId INT NOT NULL,
    OrderDate DATETIME2 DEFAULT GETUTCDATE(),
    TotalAmount DECIMAL(10,2) DEFAULT 0,
    Status NVARCHAR(20) DEFAULT 'Pending',
    ShippingAddress NVARCHAR(200),
    CONSTRAINT FK_Orders_Customers FOREIGN KEY (CustomerId) 
        REFERENCES dbo.Customers(CustomerId)
);
GO

-- OrderItems table
CREATE TABLE dbo.OrderItems (
    OrderItemId INT IDENTITY(1,1) PRIMARY KEY,
    OrderId INT NOT NULL,
    ProductId INT NOT NULL,
    Quantity INT NOT NULL,
    UnitPrice DECIMAL(10,2) NOT NULL,
    Subtotal AS (Quantity * UnitPrice) PERSISTED,
    CONSTRAINT FK_OrderItems_Orders FOREIGN KEY (OrderId) 
        REFERENCES dbo.Orders(OrderId),
    CONSTRAINT FK_OrderItems_Products FOREIGN KEY (ProductId) 
        REFERENCES dbo.Products(ProductId)
);
GO

-- Reviews table
CREATE TABLE dbo.Reviews (
    ReviewId INT IDENTITY(1,1) PRIMARY KEY,
    ProductId INT NOT NULL,
    CustomerId INT NOT NULL,
    Rating INT CHECK (Rating BETWEEN 1 AND 5),
    ReviewText NVARCHAR(1000),
    ReviewDate DATETIME2 DEFAULT GETUTCDATE(),
    CONSTRAINT FK_Reviews_Products FOREIGN KEY (ProductId) 
        REFERENCES dbo.Products(ProductId),
    CONSTRAINT FK_Reviews_Customers FOREIGN KEY (CustomerId) 
        REFERENCES dbo.Customers(CustomerId)
);
GO

-- Analytics tables
CREATE TABLE analytics.DailySales (
    SaleDate DATE PRIMARY KEY,
    TotalOrders INT,
    TotalRevenue DECIMAL(10,2),
    AverageOrderValue DECIMAL(10,2),
    LastUpdated DATETIME2 DEFAULT GETUTCDATE()
);
GO

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IX_Orders_CustomerId ON dbo.Orders(CustomerId);
CREATE INDEX IX_Orders_OrderDate ON dbo.Orders(OrderDate);
CREATE INDEX IX_OrderItems_OrderId ON dbo.OrderItems(OrderId);
CREATE INDEX IX_OrderItems_ProductId ON dbo.OrderItems(ProductId);
CREATE INDEX IX_Reviews_ProductId ON dbo.Reviews(ProductId);
CREATE INDEX IX_Products_Category ON dbo.Products(Category);
GO

-- ============================================
-- SAMPLE DATA
-- ============================================

-- Insert Customers
INSERT INTO dbo.Customers (FirstName, LastName, Email, Phone, Status)
VALUES 
    ('John', 'Doe', 'john.doe@email.com', '555-0101', 'Active'),
    ('Jane', 'Smith', 'jane.smith@email.com', '555-0102', 'Active'),
    ('Bob', 'Johnson', 'bob.johnson@email.com', '555-0103', 'Active'),
    ('Alice', 'Williams', 'alice.williams@email.com', '555-0104', 'Active'),
    ('Charlie', 'Brown', 'charlie.brown@email.com', '555-0105', 'Inactive'),
    ('Diana', 'Davis', 'diana.davis@email.com', '555-0106', 'Active'),
    ('Edward', 'Miller', 'edward.miller@email.com', '555-0107', 'Active'),
    ('Fiona', 'Wilson', 'fiona.wilson@email.com', '555-0108', 'Active'),
    ('George', 'Moore', 'george.moore@email.com', '555-0109', 'Active'),
    ('Helen', 'Taylor', 'helen.taylor@email.com', '555-0110', 'Active');
GO

-- Insert Products
INSERT INTO dbo.Products (ProductName, Category, Price, StockQuantity, IsActive)
VALUES 
    ('Laptop Pro 15', 'Electronics', 1299.99, 50, 1),
    ('Wireless Mouse', 'Electronics', 29.99, 200, 1),
    ('USB-C Hub', 'Electronics', 49.99, 150, 1),
    ('Desk Chair', 'Furniture', 299.99, 30, 1),
    ('Standing Desk', 'Furniture', 599.99, 20, 1),
    ('Office Lamp', 'Furniture', 79.99, 100, 1),
    ('Notebook Set', 'Stationery', 19.99, 500, 1),
    ('Pen Collection', 'Stationery', 14.99, 300, 1),
    ('Desk Organizer', 'Stationery', 24.99, 150, 1),
    ('Monitor 27"', 'Electronics', 349.99, 40, 1),
    ('Keyboard Mechanical', 'Electronics', 129.99, 75, 1),
    ('Webcam HD', 'Electronics', 89.99, 60, 1),
    ('Coffee Maker', 'Appliances', 79.99, 25, 1),
    ('Water Bottle', 'Accessories', 19.99, 200, 1),
    ('Backpack Pro', 'Accessories', 89.99, 80, 1);
GO

-- Insert Orders
INSERT INTO dbo.Orders (CustomerId, OrderDate, Status, ShippingAddress, TotalAmount)
VALUES 
    (1, DATEADD(DAY, -30, GETUTCDATE()), 'Delivered', '123 Main St, City, State 12345', 1379.97),
    (2, DATEADD(DAY, -25, GETUTCDATE()), 'Delivered', '456 Oak Ave, City, State 12346', 649.97),
    (3, DATEADD(DAY, -20, GETUTCDATE()), 'Delivered', '789 Pine Rd, City, State 12347', 179.96),
    (1, DATEADD(DAY, -15, GETUTCDATE()), 'Shipped', '123 Main St, City, State 12345', 479.98),
    (4, DATEADD(DAY, -10, GETUTCDATE()), 'Processing', '321 Elm St, City, State 12348', 899.98),
    (5, DATEADD(DAY, -8, GETUTCDATE()), 'Delivered', '654 Maple Dr, City, State 12349', 299.99),
    (6, DATEADD(DAY, -5, GETUTCDATE()), 'Shipped', '987 Cedar Ln, City, State 12350', 159.98),
    (7, DATEADD(DAY, -3, GETUTCDATE()), 'Processing', '147 Birch Way, City, State 12351', 219.98),
    (8, DATEADD(DAY, -2, GETUTCDATE()), 'Pending', '258 Spruce Ct, City, State 12352', 1749.97),
    (9, DATEADD(DAY, -1, GETUTCDATE()), 'Pending', '369 Willow Pl, City, State 12353', 379.96);
GO

-- Insert OrderItems
INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice)
VALUES 
    -- Order 1
    (1, 1, 1, 1299.99),
    (1, 2, 1, 29.99),
    (1, 3, 1, 49.99),
    -- Order 2
    (2, 5, 1, 599.99),
    (2, 6, 1, 49.98),
    -- Order 3
    (3, 7, 3, 19.99),
    (3, 8, 4, 14.99),
    (3, 9, 2, 24.99),
    -- Order 4
    (4, 10, 1, 349.99),
    (4, 11, 1, 129.99),
    -- Order 5
    (5, 4, 2, 299.99),
    (5, 1, 1, 299.99),
    -- Order 6
    (6, 4, 1, 299.99),
    -- Order 7
    (7, 13, 2, 79.99),
    -- Order 8
    (8, 14, 4, 19.99),
    (8, 15, 2, 89.99),
    -- Order 9
    (9, 1, 1, 1299.99),
    (9, 10, 1, 349.99),
    (9, 2, 1, 29.99),
    -- Order 10
    (10, 12, 2, 89.99),
    (10, 14, 10, 19.99);
GO

-- Insert Reviews
INSERT INTO dbo.Reviews (ProductId, CustomerId, Rating, ReviewText)
VALUES 
    (1, 1, 5, 'Excellent laptop! Fast and reliable.'),
    (1, 2, 4, 'Great performance but a bit expensive.'),
    (2, 3, 5, 'Perfect wireless mouse, very responsive.'),
    (4, 1, 5, 'Very comfortable chair, highly recommend.'),
    (5, 2, 4, 'Good desk but assembly was tricky.'),
    (10, 4, 5, 'Beautiful display, great for work.'),
    (11, 3, 5, 'Best mechanical keyboard I have owned.'),
    (7, 6, 4, 'Good quality notebooks for the price.'),
    (1, 8, 5, 'Amazing laptop, worth every penny!'),
    (15, 9, 4, 'Sturdy backpack with lots of compartments.');
GO

-- ============================================
-- STORED PROCEDURES
-- ============================================

-- Simple SELECT procedure
CREATE PROCEDURE dbo.GetCustomerById
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        CustomerId,
        FirstName,
        LastName,
        Email,
        Phone,
        Status,
        CreatedDate
    FROM dbo.Customers
    WHERE CustomerId = @CustomerId;
END
GO

-- Procedure with JOIN
CREATE PROCEDURE dbo.GetCustomerOrders
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        o.OrderId,
        o.OrderDate,
        o.Status,
        o.TotalAmount,
        o.ShippingAddress,
        COUNT(oi.OrderItemId) as ItemCount
    FROM dbo.Orders o
    LEFT JOIN dbo.OrderItems oi ON o.OrderId = oi.OrderId
    WHERE o.CustomerId = @CustomerId
    GROUP BY o.OrderId, o.OrderDate, o.Status, o.TotalAmount, o.ShippingAddress
    ORDER BY o.OrderDate DESC;
END
GO

-- Procedure with multiple tables
CREATE PROCEDURE dbo.GetOrderDetails
    @OrderId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Order header
    SELECT 
        o.OrderId,
        o.OrderDate,
        o.Status,
        o.TotalAmount,
        c.FirstName + ' ' + c.LastName as CustomerName,
        c.Email
    FROM dbo.Orders o
    INNER JOIN dbo.Customers c ON o.CustomerId = c.CustomerId
    WHERE o.OrderId = @OrderId;
    
    -- Order items
    SELECT 
        oi.OrderItemId,
        p.ProductName,
        p.Category,
        oi.Quantity,
        oi.UnitPrice,
        oi.Subtotal
    FROM dbo.OrderItems oi
    INNER JOIN dbo.Products p ON oi.ProductId = p.ProductId
    WHERE oi.OrderId = @OrderId;
END
GO

-- INSERT procedure
CREATE PROCEDURE dbo.CreateCustomer
    @FirstName NVARCHAR(50),
    @LastName NVARCHAR(50),
    @Email NVARCHAR(100),
    @Phone NVARCHAR(20) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Check if email already exists
    IF EXISTS (SELECT 1 FROM dbo.Customers WHERE Email = @Email)
    BEGIN
        RAISERROR('Email already exists', 16, 1);
        RETURN;
    END
    
    INSERT INTO dbo.Customers (FirstName, LastName, Email, Phone)
    VALUES (@FirstName, @LastName, @Email, @Phone);
    
    SELECT SCOPE_IDENTITY() as CustomerId;
END
GO

-- UPDATE procedure
CREATE PROCEDURE dbo.UpdateCustomerStatus
    @CustomerId INT,
    @Status NVARCHAR(20)
AS
BEGIN
    SET NOCOUNT ON;
    
    IF NOT EXISTS (SELECT 1 FROM dbo.Customers WHERE CustomerId = @CustomerId)
    BEGIN
        RAISERROR('Customer not found', 16, 1);
        RETURN;
    END
    
    UPDATE dbo.Customers
    SET Status = @Status,
        ModifiedDate = GETUTCDATE()
    WHERE CustomerId = @CustomerId;
    
    SELECT @@ROWCOUNT as RowsAffected;
END
GO

-- Complex procedure with transaction
CREATE PROCEDURE dbo.ProcessOrder
    @CustomerId INT,
    @OrderItems NVARCHAR(MAX), -- JSON array of items
    @ShippingAddress NVARCHAR(200)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    
    BEGIN TRY
        DECLARE @OrderId INT;
        DECLARE @TotalAmount DECIMAL(10,2) = 0;
        
        -- Create order
        INSERT INTO dbo.Orders (CustomerId, ShippingAddress, Status)
        VALUES (@CustomerId, @ShippingAddress, 'Pending');
        
        SET @OrderId = SCOPE_IDENTITY();
        
        -- Parse JSON and insert order items
        INSERT INTO dbo.OrderItems (OrderId, ProductId, Quantity, UnitPrice)
        SELECT 
            @OrderId,
            JSON_VALUE(value, '$.ProductId'),
            JSON_VALUE(value, '$.Quantity'),
            p.Price
        FROM OPENJSON(@OrderItems) 
        CROSS APPLY (
            SELECT Price FROM dbo.Products 
            WHERE ProductId = JSON_VALUE(value, '$.ProductId')
        ) p;
        
        -- Calculate total
        SELECT @TotalAmount = SUM(Subtotal)
        FROM dbo.OrderItems
        WHERE OrderId = @OrderId;
        
        -- Update order total
        UPDATE dbo.Orders
        SET TotalAmount = @TotalAmount
        WHERE OrderId = @OrderId;
        
        -- Update product stock
        UPDATE p
        SET StockQuantity = p.StockQuantity - oi.Quantity
        FROM dbo.Products p
        INNER JOIN dbo.OrderItems oi ON p.ProductId = oi.ProductId
        WHERE oi.OrderId = @OrderId;
        
        COMMIT TRANSACTION;
        
        SELECT @OrderId as OrderId, @TotalAmount as TotalAmount;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- Procedure that calls another procedure
CREATE PROCEDURE dbo.GetCustomerSummary
    @CustomerId INT
AS
BEGIN
    SET NOCOUNT ON;
    
    -- Get customer info
    EXEC dbo.GetCustomerById @CustomerId;
    
    -- Get customer orders
    EXEC dbo.GetCustomerOrders @CustomerId;
    
    -- Get review count
    SELECT COUNT(*) as ReviewCount
    FROM dbo.Reviews
    WHERE CustomerId = @CustomerId;
END
GO

-- Procedure with aggregations
CREATE PROCEDURE dbo.GetProductStatistics
    @Category NVARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        p.Category,
        COUNT(DISTINCT p.ProductId) as ProductCount,
        SUM(p.StockQuantity) as TotalStock,
        AVG(p.Price) as AveragePrice,
        MIN(p.Price) as MinPrice,
        MAX(p.Price) as MaxPrice,
        SUM(oi.Quantity) as TotalSold,
        AVG(r.Rating) as AverageRating,
        COUNT(DISTINCT r.ReviewId) as ReviewCount
    FROM dbo.Products p
    LEFT JOIN dbo.OrderItems oi ON p.ProductId = oi.ProductId
    LEFT JOIN dbo.Reviews r ON p.ProductId = r.ProductId
    WHERE (@Category IS NULL OR p.Category = @Category)
    GROUP BY p.Category
    ORDER BY p.Category;
END
GO

-- DELETE procedure
CREATE PROCEDURE dbo.DeleteOldOrders
    @DaysCutoff INT = 365
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRANSACTION;
    
    BEGIN TRY
        DECLARE @CutoffDate DATETIME2 = DATEADD(DAY, -@DaysCutoff, GETUTCDATE());
        
        -- Delete order items first (FK constraint)
        DELETE oi
        FROM dbo.OrderItems oi
        INNER JOIN dbo.Orders o ON oi.OrderId = o.OrderId
        WHERE o.OrderDate < @CutoffDate
            AND o.Status = 'Delivered';
        
        DECLARE @ItemsDeleted INT = @@ROWCOUNT;
        
        -- Delete orders
        DELETE FROM dbo.Orders
        WHERE OrderDate < @CutoffDate
            AND Status = 'Delivered';
        
        DECLARE @OrdersDeleted INT = @@ROWCOUNT;
        
        COMMIT TRANSACTION;
        
        SELECT 
            @OrdersDeleted as OrdersDeleted,
            @ItemsDeleted as ItemsDeleted;
    END TRY
    BEGIN CATCH
        ROLLBACK TRANSACTION;
        THROW;
    END CATCH
END
GO

-- Analytics procedure
CREATE PROCEDURE analytics.UpdateDailySales
    @SaleDate DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;
    
    IF @SaleDate IS NULL
        SET @SaleDate = CAST(GETUTCDATE() AS DATE);
    
    MERGE analytics.DailySales AS target
    USING (
        SELECT 
            CAST(OrderDate AS DATE) as SaleDate,
            COUNT(*) as TotalOrders,
            SUM(TotalAmount) as TotalRevenue,
            AVG(TotalAmount) as AverageOrderValue
        FROM dbo.Orders
        WHERE CAST(OrderDate AS DATE) = @SaleDate
        GROUP BY CAST(OrderDate AS DATE)
    ) AS source
    ON target.SaleDate = source.SaleDate
    WHEN MATCHED THEN
        UPDATE SET 
            TotalOrders = source.TotalOrders,
            TotalRevenue = source.TotalRevenue,
            AverageOrderValue = source.AverageOrderValue,
            LastUpdated = GETUTCDATE()
    WHEN NOT MATCHED THEN
        INSERT (SaleDate, TotalOrders, TotalRevenue, AverageOrderValue)
        VALUES (source.SaleDate, source.TotalOrders, source.TotalRevenue, source.AverageOrderValue);
END
GO

-- Report procedure
CREATE PROCEDURE reports.GetMonthlySalesReport
    @Year INT,
    @Month INT
AS
BEGIN
    SET NOCOUNT ON;
    
    SELECT 
        DATEPART(DAY, o.OrderDate) as DayOfMonth,
        COUNT(DISTINCT o.OrderId) as OrderCount,
        SUM(o.TotalAmount) as DailyRevenue,
        COUNT(DISTINCT o.CustomerId) as UniqueCustomers,
        AVG(o.TotalAmount) as AvgOrderValue
    FROM dbo.Orders o
    WHERE YEAR(o.OrderDate) = @Year
        AND MONTH(o.OrderDate) = @Month
    GROUP BY DATEPART(DAY, o.OrderDate)
    ORDER BY DATEPART(DAY, o.OrderDate);
    
    -- Summary
    SELECT 
        @Year as Year,
        @Month as Month,
        COUNT(DISTINCT OrderId) as TotalOrders,
        SUM(TotalAmount) as TotalRevenue,
        AVG(TotalAmount) as AvgOrderValue,
        COUNT(DISTINCT CustomerId) as UniqueCustomers
    FROM dbo.Orders
    WHERE YEAR(OrderDate) = @Year
        AND MONTH(OrderDate) = @Month;
END
GO

-- ============================================
-- VIEWS
-- ============================================

CREATE VIEW dbo.vw_CustomerOrderSummary
AS
SELECT 
    c.CustomerId,
    c.FirstName,
    c.LastName,
    c.Email,
    c.Status,
    COUNT(DISTINCT o.OrderId) as TotalOrders,
    ISNULL(SUM(o.TotalAmount), 0) as TotalSpent,
    MAX(o.OrderDate) as LastOrderDate
FROM dbo.Customers c
LEFT JOIN dbo.Orders o ON c.CustomerId = o.CustomerId
GROUP BY c.CustomerId, c.FirstName, c.LastName, c.Email, c.Status;
GO

CREATE VIEW dbo.vw_ProductPerformance
AS
SELECT 
    p.ProductId,
    p.ProductName,
    p.Category,
    p.Price,
    p.StockQuantity,
    ISNULL(SUM(oi.Quantity), 0) as TotalSold,
    ISNULL(SUM(oi.Subtotal), 0) as TotalRevenue,
    ISNULL(AVG(CAST(r.Rating AS FLOAT)), 0) as AvgRating,
    COUNT(DISTINCT r.ReviewId) as ReviewCount
FROM dbo.Products p
LEFT JOIN dbo.OrderItems oi ON p.ProductId = oi.ProductId
LEFT JOIN dbo.Reviews r ON p.ProductId = r.ProductId
GROUP BY p.ProductId, p.ProductName, p.Category, p.Price, p.StockQuantity;
GO

-- ============================================
-- FUNCTIONS
-- ============================================

CREATE FUNCTION dbo.fn_GetCustomerLifetimeValue
(
    @CustomerId INT
)
RETURNS DECIMAL(10,2)
AS
BEGIN
    DECLARE @LifetimeValue DECIMAL(10,2);
    
    SELECT @LifetimeValue = ISNULL(SUM(TotalAmount), 0)
    FROM dbo.Orders
    WHERE CustomerId = @CustomerId;
    
    RETURN @LifetimeValue;
END
GO

CREATE FUNCTION dbo.fn_GetProductAverageRating
(
    @ProductId INT
)
RETURNS DECIMAL(3,2)
AS
BEGIN
    DECLARE @AvgRating DECIMAL(3,2);
    
    SELECT @AvgRating = ISNULL(AVG(CAST(Rating AS DECIMAL(3,2))), 0)
    FROM dbo.Reviews
    WHERE ProductId = @ProductId;
    
    RETURN @AvgRating;
END
GO

-- ============================================
-- COMPLETION MESSAGE
-- ============================================

DECLARE @CustomerCount INT, @ProductCount INT, @OrderCount INT, @SPCount INT, @ViewCount INT, @FuncCount INT;

SELECT @CustomerCount = COUNT(*) FROM dbo.Customers;
SELECT @ProductCount = COUNT(*) FROM dbo.Products;
SELECT @OrderCount = COUNT(*) FROM dbo.Orders;
SELECT @SPCount = COUNT(*) FROM sys.procedures WHERE is_ms_shipped = 0;
SELECT @ViewCount = COUNT(*) FROM sys.views WHERE is_ms_shipped = 0;
SELECT @FuncCount = COUNT(*) FROM sys.objects WHERE type IN ('FN', 'IF', 'TF') AND is_ms_shipped = 0;

PRINT 'Database MCPTestDB created successfully!';
PRINT 'Total Customers: ' + CAST(@CustomerCount AS VARCHAR);
PRINT 'Total Products: ' + CAST(@ProductCount AS VARCHAR);
PRINT 'Total Orders: ' + CAST(@OrderCount AS VARCHAR);
PRINT 'Total Stored Procedures: ' + CAST(@SPCount AS VARCHAR);
PRINT 'Total Views: ' + CAST(@ViewCount AS VARCHAR);
PRINT 'Total Functions: ' + CAST(@FuncCount AS VARCHAR);
GO

