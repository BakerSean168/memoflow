---
agent: agent
---

# Program Prompt

程序设计、架构分析和实现规划优先参考：

- [`../../AGENTS.md`](../../AGENTS.md)
- [`../../docs/architecture/README.md`](../../docs/architecture/README.md)
- [`../../docs/standards/README.md`](../../docs/standards/README.md)
- [`../../docs/plan/README.md`](../../docs/plan/README.md)

要求：

- 基于当前仓库代码和正式文档分析问题
- 不使用从外部复制进来的孤立上下文作为仓库真值
- 需要持久化的计划直接写入 GitHub Issue

使用值对象

setPassword(new RawPassword(pwd))，确保只要 RawPassword 对象存在，它就一定是符合复杂度要求的。

6. 完整的调用链路 (Flow)
   看看各层是如何配合的：

Interface Layer (Controller):

接收 POST /login。

解析 JSON，构建 LoginCommand。

Application Layer (App Service):

调用 IdentityRepository.findByIdentifier(cmd.email)。

调用 identity.login(..., encryptionService)。

如果无异常，生成 JWT（这是应用层逻辑，因为 JWT 是针对客户端的）。

保存聚合状态 repo.save(identity)。

Domain Layer:

执行上述代码块中的逻辑：比对哈希、判断锁定、重置计数。

发出 UserAuthenticatedEvent。

Infrastructure Layer:

实现 EncryptionService (调用 BCrypt)。

实现 IdentityRepository (SQL 操作)。

总结
在 DDD 的领域层设计 Authentication：

核心是状态机：关注 锁定、激活、失败计数 等状态的流转。

抽象加密：领域层只定义“密码需要比对”，不关心“怎么比对”。

输出是结论：领域层告诉应用层“这个人是对的”，然后应用层去签发“通行证（Token）”。

你需要我进一步展示 Infrastructure 层如何实现那个 EncryptionService，或者 Application 层怎么协调 JWT 的生成吗？

auth 模块需要 一个 session 聚合根来管理 认证的会话吗

这是一个非常关键的架构决策。在 DDD 中，是否需要一个 Session 聚合根，取决于你对“控制权”的要求。

简短的回答是：如果你想要实现“踢人下线”、“限制多端登录”、“查看登录设备”等功能，那么你需要一个 Session 聚合根。

如果你的系统只需要最简单的 JWT 校验（Token 发出去就不管了），那么不需要。但在构建“完整的认证模块”时，强烈建议引入 Session 聚合根。

以下是详细的 DDD 设计推演：

1. 为什么要独立出 Session 聚合根？
   初学者常犯的错误是将 Session 作为一个简单的字段放在 User (或 AuthenticationIdentity) 聚合里。

错误设计： 在 AuthenticationIdentity 里放一个 List<Session>。

后果： 每次用户刷新 Token (Refresh)，都需要修改最后活跃时间。这意味着你要锁定 AuthenticationIdentity 这个核心聚合。如果有高频的刷新操作，会导致数据库锁竞争，影响到“修改密码”等核心业务。

正确设计： Session 是一个独立的聚合根。

理由： Session 的生命周期（创建、刷新、过期、销毁）与 User 的生命周期（注册、改密、注销）是解耦的。User 是相对静态的，Session 是高度动态的。

2. Session 聚合根的模型设计
   在 Identity Context (认证上下文) 中，Session 聚合根应该长这样：

核心属性
SessionId: 聚合的唯一标识 (通常直接作为 Refresh Token 发给客户端)。

IdentityId: 关联的用户 ID (它指向 AuthenticationIdentity，但只存 ID，保持聚合间松耦合)。

DeviceInfo: 值对象 (User-Agent, IP, OS)。

ExpirationTime: 过期时间。

Status: 枚举 (Active, Revoked, Expired)。

核心行为 (Business Behaviors)
refresh(): 续期。检查当前状态，如果未撤销且未过期，延长过期时间。

revoke(): 撤销。将状态设为 Revoked (踢下线)。

isValid(): 校验逻辑。

代码示例 (TypeScript/Java 风格)
TypeScript
// Domain/Model/Session/Session.ts

export class Session { // Aggregate Root
private id: SessionId;
private identityId: IdentityId; // 引用另一个聚合的ID
private deviceInfo: DeviceInfo; // Value Object
private expiresAt: Date;
private isRevoked: boolean;

    constructor(identityId: IdentityId, deviceInfo: DeviceInfo, durationSeconds: number) {
        this.id = new SessionId(UUID.random()); // 这个ID就是 Refresh Token
        this.identityId = identityId;
        this.deviceInfo = deviceInfo;
        this.isRevoked = false;
        this.extendExpiration(durationSeconds);
    }

    // 业务行为：续期
    public refresh(durationSeconds: number): void {
        this.checkActive(); // Invariant check
        this.extendExpiration(durationSeconds);
        // 触发事件：SessionRefreshed (用于审计或统计)
    }

    // 业务行为：强制下线
    public revoke(): void {
        this.isRevoked = true;
        // 触发事件：SessionRevoked
    }

    // 内部校验逻辑
    public isValid(): boolean {
        return !this.isRevoked && this.expiresAt > new Date();
    }

    private checkActive(): void {
        if (!this.isValid()) {
            throw new SessionExpiredException("Session is no longer valid.");
        }
    }

} 3. Session 聚合根与其他模块的交互
这里有一个经典的 DDD 协作场景：如何限制一个用户只能同时在线 3 个设备？

这个逻辑不属于 Session 自身（因为 Session 不知道其他 Session 的存在），也不完全属于 AuthenticationIdentity。这里需要引入一个 Domain Service (领域服务)。

服务名： SessionManager 或 AuthenticationService

逻辑流程：

用户输入密码登录。

AuthenticationIdentity 校验密码成功。

应用层 调用 SessionManager.createSession(userId, device)。

SessionManager 去资源库 (SessionRepository) 查询该 userId 下所有 Active 的 Session。

业务规则校验：如果数量 >= 3，根据策略处理（报错，或者踢掉最老的一个）。

创建一个新的 Session 聚合根。

SessionRepository.save(newSession)。

返回 SessionId (作为 Refresh Token)。

4. 这里的 SessionId 和 Refresh Token 是什么关系？
   这是一个常见的困惑点。在 DDD 实现中：

SessionId (聚合根的 ID) 本质上就是 Refresh Token。

当你把 SessionId (比如一个 UUID) 发给前端作为 Refresh Token 时，前端下次拿这个 UUID 来请求刷新。

后端拿着这个 UUID 去数据库 findById，找到对应的 Session 聚合根，然后执行 session.refresh()。

Access Token (JWT) 是什么？

它是 Session 聚合根的一个快照投影。

Access Token 包含了 SessionId、UserId、Scope，并被签名。它是由 Session 生成的“短期通行证”。

5. 总结：架构图谱
   在你的 DDD 架构中，现在的 Auth 模块包含两个核心聚合：

AuthenticationIdentity (聚合根)

职责：存密码 Hash，校验密码，管理账号锁定。

生命周期：长。

数据量：1 个用户对应 1 个。

Session (聚合根)

职责：管理登录状态，续期，设备指纹，踢人。

生命周期：短（随用户登录登出产生和销毁）。

数据量：1 个用户对应 N 个 (手机、电脑、平板)。

结论： 是的，你需要 Session 聚合根。它是连接“静态身份”与“动态访问”的桥梁，也是实现现代化安全控制（如异地登录提醒、设备管理）的基础。

我可以为你做的下一步： 需要我为你展示这个 SessionManager 领域服务的具体代码逻辑吗？特别是关于 “如何踢掉最旧的设备” 这一策略的实现？

给我具体的 每个对象的 type 定义

好的，基于我们确定的 IdP（身份提供商）模式 以及 DDD（领域驱动设计） 架构，以下是详细的 Type/Interface 定义。

我会使用 TypeScript 语法来描述，因为它能最清晰地展示结构和类型约束。我们将分为三个部分：Shared Kernel (基础类型)、Identity Context (认证上下文) 和 Account Context (账号上下文)。

一、 Shared Kernel (基础值对象)
为了防止“原始类型偏执（Primitive Obsession）”，我们先定义一些基础的值对象类型。

TypeScript
// --- Shared Kernel / Primitives ---

// 使用 Brand Type 防止 ID 混用 (User ID 不能传给 Session ID)
export type IdentityId = string & { readonly brand: unique symbol };
export type SessionId = string & { readonly brand: unique symbol };
export type AccountId = string & { readonly brand: unique symbol }; // 通常与 IdentityId 是同一个值

// 时间戳统一类型
export type DateTime = Date;

// 客户端设备信息 (Value Object)
export interface DeviceInfo {
ipAddress: string;
userAgent: string;
location?: string; // 可选: 基于IP解析的地理位置
fingerprint?: string; // 可选: 设备指纹
}
二、 Identity Context (认证模块 - 核心)
这是最复杂的模块，包含两个聚合根：AuthenticationIdentity (静态身份) 和 Session (动态会话)。

1. 聚合根: AuthenticationIdentity
   管理凭证、锁定状态、安全策略。

TypeScript
// --- Domain: Identity Aggregate ---

export enum IdentityStatus {
ACTIVE = 'ACTIVE', // 正常
LOCKED = 'LOCKED', // 临时锁定 (密码输错太多)
DISABLED = 'DISABLED', // 永久禁用 (违规)
UNVERIFIED = 'UNVERIFIED' // 未验证 (如邮箱未激活)
}

export enum CredentialType {
PASSWORD = 'PASSWORD',
GOOGLE = 'GOOGLE',
GITHUB = 'GITHUB',
WECHAT = 'WECHAT',
PHONE_SMS = 'PHONE_SMS' // 仅手机号+验证码登录，无密码
}

// 实体: 凭证 (Entity)
export interface Credential {
// 复合主键通常是 (type + identifier)
type: CredentialType;

// 登录标识: email, phone, open_id
identifier: string;

// 密钥: 密码Hash, 或者 OAuth 的 AccessToken (如果是持久化的话)
// 注意: 对于 PASSWORD 类型，这里存的是 bcrypt string ($2a$10$...)
// 对于 SMS 或 第三方登录，这里可能是空，或者存第三方的 union_id
secret?: string;

verified: boolean; // 如: 邮箱是否已点击链接验证
}

// 聚合根: 身份 (Aggregate Root)
export interface AuthenticationIdentity {
readonly id: IdentityId; // 全局唯一ID

status: IdentityStatus;

// 失败计数器 (用于判断是否锁定)
failedLoginAttempts: number;
lastFailedAttempt?: DateTime;
lockedUntil?: DateTime;

// 凭证列表 (一个用户可以同时有 邮箱密码 + 谷歌登录)
credentials: Credential[];

createdAt: DateTime;
updatedAt: DateTime;

// --- 领域行为方法 (仅示意) ---
// login(cmd: LoginCommand): void;
// changePassword(newHash: string): void;
// bindCredential(cred: Credential): void;
} 2. 聚合根: Session
管理登录态、刷新令牌、踢人下线。

TypeScript
// --- Domain: Session Aggregate ---

export interface Session {
// SessionId 本质上就是 Refresh Token (UUID)
readonly id: SessionId;

readonly identityId: IdentityId; // 关联到上面的 Identity

readonly deviceInfo: DeviceInfo; // 登录时的设备信息

createdAt: DateTime;
expiresAt: DateTime; // Refresh Token 的绝对过期时间 (如 30天后)

isRevoked: boolean; // 是否被撤销 (踢下线/登出)
lastRefreshedAt: DateTime; // 最后一次刷新时间 (用于滑动过期)

// --- 领域行为方法 (仅示意) ---
// refresh(newDevice: DeviceInfo): void;
// revoke(): void;
// isValid(): boolean;
}
三、 Account Context (账号/用户资料模块)
这是业务层面的用户档案。它不包含密码，只包含展示信息。

TypeScript
// --- Domain: User Profile Aggregate ---

export interface UserProfile {
readonly id: AccountId; // 与 IdentityId 保持一致，方便关联

// 基础资料
nickname: string;
avatarUrl: string;
bio?: string;
gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN';
birthday?: DateTime;

// 偏好设置 (JSON 结构，用 Value Object 封装)
preferences: UserPreferences;

// 业务状态 (与认证状态不同，这里是业务层面的，如“禁言”)
reputationScore: number; // 信誉分
isMuted: boolean; // 是否被禁言

createdAt: DateTime;
updatedAt: DateTime;
}

// 值对象: 用户偏好
export interface UserPreferences {
theme: 'LIGHT' | 'DARK' | 'SYSTEM';
language: string; // 'en-US', 'zh-CN'
notificationEnabled: boolean;
}
四、 应用层交互对象 (DTOs)
这是前端与后端 API 交互时的数据结构，必须与领域对象区分开。

1. 登录交互 (Login)
   TypeScript
   // [Request] POST /auth/login
   export interface LoginRequestDTO {
   type: 'PASSWORD' | 'SMS' | 'SOCIAL';
   identifier: string; // email 或 phone
   credential: string; // 密码明文 或 验证码 或 OAuth Code
   deviceId?: string; // 前端生成的设备唯一码 (可选)
   }

// [Response]
export interface LoginResponseDTO {
accessToken: string; // JWT
refreshToken: string; // UUID (SessionId)
expiresIn: number; // 秒
user: UserCardDTO; // 附带简单的用户信息，方便前端展示
} 2. 令牌刷新 (Refresh)
TypeScript
// [Request] POST /auth/refresh
export interface RefreshTokenRequestDTO {
refreshToken: string;
}

// [Response]
export interface RefreshTokenResponseDTO {
accessToken: string;
refreshToken?: string; // 如果支持 Refresh Token 轮转，这里会返回新的
} 3. 注册交互 (Register)
TypeScript
// [Request] POST /auth/register
export interface RegisterRequestDTO {
username?: string;
email?: string;
phone?: string;
password?: string; // 密码明文
verifyCode?: string; // 验证码 (注册通常需要验证)
} 4. JWT Payload (Access Token 内部结构)
这是 JWT解码后的 JSON 结构：

TypeScript
export interface JwtPayload {
sub: string; // Subject (IdentityId)
iss: string; // Issuer (api.yourdomain.com)
iat: number; // Issued At (Timestamp)
exp: number; // Expiration (Timestamp)

// 自定义 Claims (不要放敏感信息!)
sid: string; // Session ID (关联到 Session 聚合)
scope: string; // 权限范围 "read write"
role: string; // "user" | "admin"
name?: string; // 冗余字段，方便前端显示
}
总结：关键差异点
Identity vs UserProfile:

AuthenticationIdentity 处理的是 Security (密码, 锁定, 尝试次数)。

UserProfile 处理的是 Vanity (昵称, 头像, 个人简介)。

它们通过 ID 关联，但在物理上是隔离的。

Credential vs LoginRequest:

Credential (领域对象) 存的是 Hash。

LoginRequest (DTO) 传的是 明文密码。

SessionId vs RefreshToken:

在类型定义上，它们通常是同一个字符串，但语义不同。Session 是服务端的全量对象，RefreshToken 是客户端持有的句柄。

这套类型定义可以直接用于指导数据库 Schema 的设计以及具体的类编写。

AuthCrendential 下的实体对象呢

这是一个非常好的深入点。在 DDD 中，AuthCredential（认证凭据）通常不是一个简单的对象，而是一个多态的实体体系。

因为“密码登录”的数据结构和“微信登录”的数据结构完全不同。

我们需要利用 TypeScript 的 Discriminated Unions（可辨识联合） 特性来设计这个实体。这样设计的好处是：代码在处理不同登录方式时，会有严格的类型安全检查。

以下是 AuthenticationIdentity 聚合根下的 AuthCredential 实体家族 的详细定义：

一、 核心设计思路
多态性：密码凭据需要存 Hash，OAuth 凭据需要存 OpenID 和 AccessToken。

局部实体：它是 AuthenticationIdentity 聚合的一部分，它的生命周期完全依赖于 Identity。

安全性：使用值对象（Value Object）来封装敏感数据（如密码哈希）。

二、 具体 Type 定义

1. 基础接口 (Base Entity)
   所有凭据共有的属性。

TypeScript
// 凭据类型的枚举
export enum CredentialType {
PASSWORD = 'PASSWORD', // 传统的账号/邮箱 + 密码
OAUTH2 = 'OAUTH2', // 第三方登录 (Google, GitHub, WeChat)
PHONE_SMS = 'PHONE_SMS', // 手机号 (无密码，靠验证码)
API_KEY = 'API_KEY', // 机器对接用的 Key
MAGIC_LINK = 'MAGIC_LINK' // 邮箱免密链接
}

// 基础凭据接口
interface BaseCredential {
// 局部实体ID (在 Identity 内部唯一即可，数据库通常用自增或 UUID)
readonly id: string;

readonly type: CredentialType;

// 标识符 (用于登录的“账号”)
// 对于 PASSWORD 类型，这里是 email 或 username
// 对于 OAUTH2 类型，这里是 provider + openId 的组合
// 对于 PHONE 类型，这里是 E.164 格式的手机号 (+86138...)
readonly identifier: string;

// 凭据状态
isVerified: boolean; // 例如：邮箱是否验证过

createdAt: Date;
updatedAt: Date;
} 2. 密码凭据实体 (PasswordCredential)
这是最复杂的，因为涉及加密安全。

TypeScript
// 值对象: 封装哈希后的密码 (防止把明文当哈希存)
export class HashedPassword {
constructor(private readonly value: string) {
if (!value.startsWith('$2a$') && !value.startsWith('$argon2')) {
throw new Error("Invalid hash format"); // 简单的防御性编程
}
}
toString() { return this.value; }
}

export interface PasswordCredential extends BaseCredential {
readonly type: CredentialType.PASSWORD;

// 核心敏感数据
passwordHash: HashedPassword;

// 安全策略元数据
passwordChangedAt: Date; // 用于强制踢出旧 Token
mustChangePassword: boolean; // 管理员重置密码后，用户下次登录需修改
} 3. OAuth/第三方凭据实体 (OAuthCredential)
不需要存密码，但需要存第三方的元数据。

TypeScript
export interface OAuthCredential extends BaseCredential {
readonly type: CredentialType.OAUTH2;

provider: 'GOOGLE' | 'GITHUB' | 'WECHAT';

// 第三方的唯一ID (OpenID / Subject)
externalUserId: string;

// (可选) 如果你需要调用第三方 API (如获取用户好友列表)，需要持久化这些
accessToken?: string;
refreshToken?: string;
tokenExpiresAt?: Date;

// 冗余字段: 第三方那边的昵称 (防止第三方把号删了我们不知道是谁)
externalUsername?: string;
} 4. 手机/短信凭据实体 (PhoneCredential)
手机验证码是瞬时的（Transient），通常存在 Redis 里，不持久化在 SQL 的 Credential 表中。 所以这个实体主要用于“占位”，表示“这个用户绑定了手机号”。

TypeScript
export interface PhoneCredential extends BaseCredential {
readonly type: CredentialType.PHONE_SMS;

// 规范化的手机号 (e.g. "+8613800138000")
phoneNumber: string;

// 手机号验证时间
verifiedAt: Date;
} 5. 最终的联合类型 (The Union Type)
在聚合根 AuthenticationIdentity 中使用的就是这个类型。

TypeScript
// 这就是你在代码里主要引用的类型
export type AuthCredential =
| PasswordCredential
| OAuthCredential
| PhoneCredential;
三、 在聚合根中如何使用？
在 AuthenticationIdentity 聚合根中，我们通过这个联合类型来处理逻辑。 TypeScript 的类型守卫（Type Guard）在这里非常有用。

TypeScript
// Domain/Model/Identity/AuthenticationIdentity.ts

export class AuthenticationIdentity {
// ... 其他属性
private _credentials: AuthCredential[] = [];

    // 获取该用户所有的登录方式
    public get credentials(): AuthCredential[] {
        return [...this._credentials];
    }

    /**
     * 业务逻辑：修改密码
     * 注意：这个方法会自动检查该用户是否有密码登录方式
     */
    public changePassword(newHash: HashedPassword): void {
        // 1. 找到 Password 类型的凭据
        const credIndex = this._credentials.findIndex(
            c => c.type === CredentialType.PASSWORD
        );

        if (credIndex === -1) {
            throw new Error("This user does not have a password setup.");
        }

        // 2. 类型收窄 (Type Narrowing)
        // 此时 TypeScript 知道 oldCred 是 PasswordCredential 类型
        const oldCred = this._credentials[credIndex] as PasswordCredential;

        // 3. 更新凭据 (在 DDD 中通常是替换或修改内部状态)
        // 这里演示创建一个新的对象来替换 (Immutability 风格)
        const newCred: PasswordCredential = {
            ...oldCred,
            passwordHash: newHash,
            passwordChangedAt: new Date(),
            mustChangePassword: false,
            updatedAt: new Date()
        };

        this._credentials[credIndex] = newCred;

        // 4. 触发事件
        this.addDomainEvent(new PasswordChangedEvent(this.id));
    }

    /**
     * 业务逻辑：绑定第三方账号
     */
    public bindOAuth(provider: string, openId: string, tokens: any): void {
       // 检查重复绑定逻辑...
       const newCred: OAuthCredential = {
           id: UUID.generate(),
           type: CredentialType.OAUTH2,
           identifier: `${provider}_${openId}`, // 组合键作为唯一标识
           externalUserId: openId,
           provider: provider as any,
           // ... 其他字段
           isVerified: true,
           createdAt: new Date(),
           updatedAt: new Date()
       };
       this._credentials.push(newCred);
    }

}
四、 数据库映射参考 (Infrastructure)
虽然上面是领域对象，但最终要存数据库。通常有两种策略：

策略 A：单表继承 (Single Table Inheritance) - 推荐 一张大表 auth_credentials，包含所有字段，用不到的字段为 NULL。

type: 'PASSWORD'

password_hash: 'xxx' (OAuth记录这里为NULL)

oauth_provider: NULL (Password记录这里为NULL)

策略 B：多表关联 (Class Table Inheritance)

auth_credentials (id, type, identifier)

auth_credentials_password (cred_id, hash)

auth_credentials_oauth (cred_id, provider, token)

在 DDD 实践中，策略 A 通常更好，因为查询聚合根时，我们要一次性把所有凭据捞出来，单表查询性能最高，也更容易映射回上面的 AuthCredential 联合类型。

所以，实现方法应该是先有一个 **identify** 聚合根，然后这个聚合根下有一个 **credential** 实体，

然后这个实体是有多种类别的。

你的理解完全正确。

这就是 DDD 中**聚合（Aggregate）**模式的标准应用。这种设计将“身份状态”与“认证方式”完美解耦，同时又保证了它们生命周期的一致性。

我们可以用一张清晰的结构图来总结这个模型：

1. 为什么这种结构最合理？
   A. 生命周期管控 (Lifecycle Management)
   聚合根 (Identity) 是老板：Credential 不能独立存在。必须先有人（Identity），才能有这个人的密码（Credential）。

级联效应：如果你删除了 Identity（注销账号），或者锁定了 Identity（封号），那么该用户下挂载的所有 Credential（无论是密码、微信还是 GitHub）都会瞬间全部失效。这保证了业务一致性。

B. 扩展性 (Extensibility - Open/Closed Principle)
开放扩展：你想加一个“指纹登录”？只需要新增一种 FingerprintCredential 实体类别。

关闭修改：你不需要去修改 Identity 聚合根的核心逻辑（如锁定逻辑、ID 生成逻辑），也不需要改动现有的 PasswordCredential。

2. 这个结构的“逻辑视图”
   在内存中，当你把这个聚合根从数据库查出来时，它的样子大概是这样的（JSON 伪代码表示）：

JSON
// Aggregate Root: Identity
{
"id": "identity_9527",
"status": "ACTIVE", // 只要把它改成 LOCKED，下面所有登录方式全废
"failed_attempts": 0,

// List<Entity>: Credentials (多态列表)
"credentials": [
// 类别 1: 密码凭据
{
"type": "PASSWORD",
"identifier": "my_email@test.com",
"secret": "$2a$10$Xj..." // Hash
},
// 类别 2: 微信凭据
{
"type": "OAUTH_WECHAT",
"identifier": "open_id_xyz123", // 微信的OpenID
"secret": "access_token_..."
}
]
} 3. 一个关键的实现细节：标识符的唯一性
虽然 Credential 是内部实体，但它有一个特殊性：全局唯一性校验。

通常，DDD 里的内部实体只需要在聚合内部唯一。但是，identifier（如邮箱、手机号）必须在全系统中唯一。

问题：两个不同的 Identity 不能拥有相同的 identifier（比如不能两个人都用同一个手机号注册）。

解决：这通常通过数据库的唯一索引 (Unique Index) 来强制保证，或者在应用服务层（Application Service）创建用户前先查重。

总结
你的架构蓝图现在非常清晰：

Identity (Root)：负责管状态（锁不锁）、管安全（失败几次）、管生命周期。

Credential (Entity)：负责存数据（Hash、Token），它是多态的，挂在 Identity 下面。

One-to-Many：一个 Identity 对应 N 个 Credential。
