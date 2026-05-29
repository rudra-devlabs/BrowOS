// Snake game for BrowOS
class SnakeGame {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 400;
        this.canvas.height = 400;
        this.canvas.style.background = '#000';
        this.canvas.style.display = 'block';
        this.canvas.style.margin = '20px auto';
        container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');
        
        // Game state
        this.gridSize = 20;
        this.gridWidth = this.canvas.width / this.gridSize;
        this.gridHeight = this.canvas.height / this.gridSize;
        this.snake = [{x: 10, y: 10}];
        this.direction = 'right';
        this.nextDirection = 'right';
        this.food = this.generateFood();
        this.score = 0;
        this.gameOver = false;
        this.paused = false;
        
        // Bindings
        this.handleKeyDown = this.handleKeyDown.bind(this);
        this.gameLoop = this.gameLoop.bind(this);
        
        // Start game
        document.addEventListener('keydown', this.handleKeyDown);
        this.lastRender = 0;
        this.requestAnimationFrame = window.requestAnimationFrame ||
                                    window.webkitRequestAnimationFrame ||
                                    window.mozRequestAnimationFrame ||
                                    function(callback) { window.setTimeout(callback, 1000/60); };
        this.requestAnimationFrame(this.gameLoop);
    }
    
    handleKeyDown(e) {
        if (this.gameOver) {
            if (e.key === 'Enter') {
                this.reset();
            }
            return;
        }
        
        switch(e.key) {
            case 'ArrowUp':
                if (this.direction !== 'down') this.nextDirection = 'up';
                break;
            case 'ArrowDown':
                if (this.direction !== 'up') this.nextDirection = 'down';
                break;
            case 'ArrowLeft':
                if (this.direction !== 'right') this.nextDirection = 'left';
                break;
            case 'ArrowRight':
                if (this.direction !== 'left') this.nextDirection = 'right';
                break;
            case ' ':
            case 'p':
            case 'P':
                this.paused = !this.paused;
                break;
        }
    }
    
    generateFood() {
        let food;
        do {
            food = {
                x: Math.floor(Math.random() * this.gridWidth),
                y: Math.floor(Math.random() * this.gridHeight)
            };
        } while (this.snake.some(segment => segment.x === food.x && segment.y === food.y));
        return food;
    }
    
    update() {
        if (this.gameOver || this.paused) return;
        
        this.direction = this.nextDirection;
        
        const head = {x: this.snake[0].x, y: this.snake[0].y};
        
        switch(this.direction) {
            case 'up': head.y--; break;
            case 'down': head.y++; break;
            case 'left': head.x--; break;
            case 'right': head.x++; break;
        }
        
        // Check wall collision
        if (head.x < 0 || head.x >= this.gridWidth || head.y < 0 || head.y >= this.gridHeight) {
            this.gameOver = true;
            return;
        }
        
        // Check self collision
        if (this.snake.some(segment => segment.x === head.x && segment.y === head.y)) {
            this.gameOver = true;
            return;
        }
        
        this.snake.unshift(head);
        
        // Check food
        if (head.x === this.food.x && head.y === this.food.y) {
            this.score++;
            this.food = this.generateFood();
        } else {
            this.snake.pop();
        }
    }
    
    draw() {
        // Clear
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw snake
        this.ctx.fillStyle = '#0f0';
        this.snake.forEach(segment => {
            this.ctx.fillRect(
                segment.x * this.gridSize,
                segment.y * this.gridSize,
                this.gridSize - 1,
                this.gridSize - 1
            );
        });
        
        // Draw food
        this.ctx.fillStyle = '#f00';
        this.ctx.fillRect(
            this.food.x * this.gridSize,
            this.food.y * this.gridSize,
            this.gridSize - 1,
            this.gridSize - 1
        );
        
        // Draw score
        this.ctx.fillStyle = '#fff';
        this.ctx.font = '20px sans-serif';
        this.ctx.textAlign = 'left';
        this.ctx.fillText(`Score: ${this.score}`, 10, 30);
        
        // Draw game over
        if (this.gameOver) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '30px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Game Over', this.canvas.width/2, this.canvas.height/2 - 20);
            this.ctx.font = '20px sans-serif';
            this.ctx.fillText(`Score: ${this.score}`, this.canvas.width/2, this.canvas.height/2 + 20);
            this.ctx.fillText('Press Enter to Restart', this.canvas.width/2, this.canvas.height/2 + 50);
        }
        
        // Draw paused
        if (this.paused && !this.gameOver) {
            this.ctx.fillStyle = 'rgba(0,0,0,0.7)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#fff';
            this.ctx.font = '30px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Paused', this.canvas.width/2, this.canvas.height/2);
        }
    }
    
    gameLoop(timestamp) {
        const delta = timestamp - (this.lastRender || timestamp);
        if (delta > 100) { // 10 FPS
            this.lastRender = timestamp;
            this.update();
            this.draw();
        }
        this.requestAnimationFrame(this.gameLoop);
    }
    
    reset() {
        this.snake = [{x: 10, y: 10}];
        this.direction = 'right';
        this.nextDirection = 'right';
        this.food = this.generateFood();
        this.score = 0;
        this.gameOver = false;
        this.paused = false;
    }
    
    destroy() {
        document.removeEventListener('keydown', this.handleKeyDown);
        if (this.canvas && this.canvas.parentNode) {
            this.canvas.parentNode.removeChild(this.canvas);
        }
    }
}

// Expose globally for window.js to use
window.SnakeGame = SnakeGame;