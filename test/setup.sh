#!/bin/bash
# setup.sh - Setup and manage SQL Server for MCP testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="mcp-sqlserver"
SA_PASSWORD="McpTest123!"
DATABASE_NAME="MCPTestDB"

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker Desktop."
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running. Please start Docker Desktop."
        exit 1
    fi
    
    print_status "Docker is running"
}

create_directories() {
    mkdir -p init-scripts
    mkdir -p backups
    print_status "Created necessary directories"
}

start_server() {
    print_status "Starting SQL Server container..."
    
    if [ "$(docker ps -q -f name=$CONTAINER_NAME)" ]; then
        print_warning "Container already running"
        return
    fi
    
    if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
        print_status "Starting existing container..."
        docker start $CONTAINER_NAME
    else
        print_status "Creating new container..."
        docker-compose up -d
    fi
    
    print_status "Waiting for SQL Server to be ready..."
    sleep 15
    
    # Wait for health check
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker exec $CONTAINER_NAME /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &> /dev/null; then
            print_status "SQL Server is ready!"
            return
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 2
    done
    
    print_error "SQL Server failed to start"
    exit 1
}

initialize_database() {
    print_status "Initializing database..."
    
    if [ ! -f "init-scripts/01-create-database.sql" ]; then
        print_error "Database initialization script not found!"
        print_warning "Please create init-scripts/01-create-database.sql"
        exit 1
    fi
    
    docker exec -i $CONTAINER_NAME /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C < init-scripts/01-create-database.sql
    
    print_status "Database initialized successfully!"
}

test_connection() {
    print_status "Testing connection..."
    
    docker exec $CONTAINER_NAME /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -d "$DATABASE_NAME" -Q "
        SELECT 'Connection successful!' as Status;
        SELECT 'Customers: ' + CAST(COUNT(*) AS VARCHAR) FROM dbo.Customers;
        SELECT 'Products: ' + CAST(COUNT(*) AS VARCHAR) FROM dbo.Products;
        SELECT 'Orders: ' + CAST(COUNT(*) AS VARCHAR) FROM dbo.Orders;
        SELECT 'Stored Procedures: ' + CAST(COUNT(*) AS VARCHAR) FROM sys.procedures WHERE is_ms_shipped = 0;
    "
}

show_connection_info() {
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  SQL Server Connection Information"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "  Server:   localhost,1433"
    echo "  Database: $DATABASE_NAME"
    echo "  Username: sa"
    echo "  Password: $SA_PASSWORD"
    echo ""
    echo "  Connection String:"
    echo "  Server=localhost,1433;Database=$DATABASE_NAME;User Id=sa;Password=$SA_PASSWORD;TrustServerCertificate=true"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
}

stop_server() {
    print_status "Stopping SQL Server container..."
    docker-compose down
    print_status "Container stopped"
}

restart_server() {
    stop_server
    start_server
}

reset_database() {
    print_warning "This will delete all data and reinitialize the database!"
    read -p "Are you sure? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_status "Reset cancelled"
        return
    fi
    
    print_status "Resetting database..."
    initialize_database
    test_connection
    print_status "Database reset complete!"
}

backup_database() {
    local backup_file="backups/${DATABASE_NAME}_$(date +%Y%m%d_%H%M%S).bak"
    
    print_status "Backing up database to $backup_file..."
    
    docker exec $CONTAINER_NAME /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "
        BACKUP DATABASE [$DATABASE_NAME]
        TO DISK = '/var/opt/mssql/backups/$(basename $backup_file)'
        WITH FORMAT, INIT, NAME = 'Full Backup';
    "
    
    print_status "Backup completed: $backup_file"
}

show_logs() {
    docker logs -f $CONTAINER_NAME
}

open_shell() {
    print_status "Opening SQL Server shell..."
    print_warning "Type 'quit' or 'exit' to leave"
    echo ""
    
    docker exec -it $CONTAINER_NAME /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -d "$DATABASE_NAME"
}

show_stats() {
    print_status "Database Statistics:"
    echo ""
    
    docker exec $CONTAINER_NAME /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -d "$DATABASE_NAME" -Q "SET NOCOUNT ON; SELECT 'Tables' as ObjectType, COUNT(*) as [Count] FROM sys.tables WHERE is_ms_shipped = 0 UNION ALL SELECT 'Stored Procedures', COUNT(*) FROM sys.procedures WHERE is_ms_shipped = 0 UNION ALL SELECT 'Views', COUNT(*) FROM sys.views WHERE is_ms_shipped = 0 UNION ALL SELECT 'Functions', COUNT(*) FROM sys.objects WHERE type IN ('FN', 'IF', 'TF') AND is_ms_shipped = 0; SELECT 'Customers' as TableName, COUNT(*) as [RowCount] FROM dbo.Customers UNION ALL SELECT 'Products', COUNT(*) FROM dbo.Products UNION ALL SELECT 'Orders', COUNT(*) FROM dbo.Orders UNION ALL SELECT 'OrderItems', COUNT(*) FROM dbo.OrderItems UNION ALL SELECT 'Reviews', COUNT(*) FROM dbo.Reviews;"
}

show_menu() {
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo "  SQL Server MCP Test Environment"
    echo "═══════════════════════════════════════════════════"
    echo ""
    echo "  1) Start server"
    echo "  2) Stop server"
    echo "  3) Restart server"
    echo "  4) Initialize/Reset database"
    echo "  5) Test connection"
    echo "  6) Show connection info"
    echo "  7) Show database stats"
    echo "  8) Backup database"
    echo "  9) Open SQL shell"
    echo "  10) Show logs"
    echo "  11) Exit"
    echo ""
    echo "═══════════════════════════════════════════════════"
    echo ""
}

main() {
    check_docker
    create_directories
    
    if [ $# -eq 0 ]; then
        # Interactive mode
        while true; do
            show_menu
            read -p "Select an option: " choice
            
            case $choice in
                1) start_server ;;
                2) stop_server ;;
                3) restart_server ;;
                4) reset_database ;;
                5) test_connection ;;
                6) show_connection_info ;;
                7) show_stats ;;
                8) backup_database ;;
                9) open_shell ;;
                10) show_logs ;;
                11) 
                    print_status "Goodbye!"
                    exit 0
                    ;;
                *)
                    print_error "Invalid option"
                    ;;
            esac
            
            echo ""
            read -p "Press Enter to continue..."
        done
    else
        # Command line mode
        case $1 in
            start)
                start_server
                ;;
            stop)
                stop_server
                ;;
            restart)
                restart_server
                ;;
            init)
                start_server
                initialize_database
                test_connection
                show_connection_info
                ;;
            reset)
                reset_database
                ;;
            test)
                test_connection
                ;;
            info)
                show_connection_info
                ;;
            stats)
                show_stats
                ;;
            backup)
                backup_database
                ;;
            shell)
                open_shell
                ;;
            logs)
                show_logs
                ;;
            *)
                echo "Usage: $0 {start|stop|restart|init|reset|test|info|stats|backup|shell|logs}"
                echo ""
                echo "  start   - Start SQL Server container"
                echo "  stop    - Stop SQL Server container"
                echo "  restart - Restart container"
                echo "  init    - Initialize database with test data"
                echo "  reset   - Reset database to initial state"
                echo "  test    - Test database connection"
                echo "  info    - Show connection information"
                echo "  stats   - Show database statistics"
                echo "  backup  - Create database backup"
                echo "  shell   - Open SQL interactive shell"
                echo "  logs    - Show container logs"
                echo ""
                echo "Run without arguments for interactive mode"
                exit 1
                ;;
        esac
    fi
}

main "$@"

